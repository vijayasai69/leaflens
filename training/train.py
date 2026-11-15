"""Fine-tune LeafLens with field-photo data and report held-out performance."""

import argparse
import json
import os
import re
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from datasets import ClassLabel, concatenate_datasets, load_dataset
from sklearn.metrics import accuracy_score, f1_score
from torchvision.transforms import ColorJitter, Compose, RandomHorizontalFlip, RandomRotation
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
    DefaultDataCollator,
    Trainer,
    TrainingArguments,
)


FIELD_LABELS = {
    "apple scab leaf": "Apple___Apple_scab",
    "apple leaf": "Apple___healthy",
    "apple rust leaf": "Apple___Cedar_apple_rust",
    "bell pepper leaf": "Pepper,_bell___healthy",
    "bell pepper leaf spot": "Pepper,_bell___Bacterial_spot",
    "blueberry leaf": "Blueberry___healthy",
    "cherry leaf": "Cherry_(including_sour)___healthy",
    "corn gray leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
    "corn leaf blight": "Corn_(maize)___Northern_Leaf_Blight",
    "corn rust leaf": "Corn_(maize)___Common_rust_",
    "peach leaf": "Peach___healthy",
    "potato leaf early blight": "Potato___Early_blight",
    "potato leaf late blight": "Potato___Late_blight",
    "raspberry leaf": "Raspberry___healthy",
    "soyabean leaf": "Soybean___healthy",
    "squash powdery mildew leaf": "Squash___Powdery_mildew",
    "strawberry leaf": "Strawberry___healthy",
    "tomato early blight leaf": "Tomato___Early_blight",
    "tomato septoria leaf spot": "Tomato___Septoria_leaf_spot",
    "tomato leaf": "Tomato___healthy",
    "tomato leaf bacterial spot": "Tomato___Bacterial_spot",
    "tomato leaf late blight": "Tomato___Late_blight",
    "tomato leaf mosaic virus": "Tomato___Tomato_mosaic_virus",
    "tomato leaf yellow virus": "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "tomato mold leaf": "Tomato___Leaf_Mold",
    "tomato two spotted spider mites leaf": "Tomato___Spider_mites Two-spotted_spider_mite",
    "grape leaf": "Grape___healthy",
    "grape leaf black rot": "Grape___Black_rot",
}


def normalize_name(value):
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def metrics_for(prediction):
    truth = prediction.label_ids
    guess = np.argmax(prediction.predictions, axis=1)
    seen = np.unique(truth)
    return {
        "accuracy": float(accuracy_score(truth, guess)),
        "macro_f1": float(f1_score(truth, guess, labels=seen, average="macro", zero_division=0)),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="Project-AgML/plant_village_classification")
    parser.add_argument("--field-dataset", default="Project-AgML/plant_doc_classification")
    parser.add_argument("--model", default="vijayasai69/leaflens-plant-disease")
    parser.add_argument("--output-dir", default="./artifacts/leaflens-field-finetuned")
    parser.add_argument("--hub-model-id", default=os.getenv("HF_HUB_MODEL_ID"))
    parser.add_argument("--epochs", type=float, default=4)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=2)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--eval-size", type=float, default=0.1)
    parser.add_argument("--field-eval-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print(f"Loading PlantVillage: {args.dataset}", flush=True)
    plant_village = load_dataset(args.dataset, split="train")
    label_feature = plant_village.features["label"]
    labels = label_feature.names
    if not labels:
        raise ValueError("Expected the PlantVillage label column to be ClassLabel.")
    label_to_id = {name: index for index, name in enumerate(labels)}
    pv_split = plant_village.train_test_split(
        test_size=args.eval_size,
        seed=args.seed,
        stratify_by_column="label",
    )

    print(f"Loading field photos: {args.field_dataset}", flush=True)
    field = load_dataset(args.field_dataset, split="train")
    field_label_feature = field.features["label"]
    if not isinstance(field_label_feature, ClassLabel):
        raise ValueError("Expected the field dataset's label column to be ClassLabel.")
    source_labels = field_label_feature.names
    field = field.cast_column("label", __import__("datasets").Value("int64"))

    def map_field_label(row):
        source_name = source_labels[row["label"]]
        canonical = FIELD_LABELS.get(normalize_name(source_name))
        return {"label": label_to_id.get(canonical, -1)}

    field = field.map(map_field_label, desc="Mapping field labels to LeafLens classes")
    field = field.filter(lambda row: row["label"] >= 0, desc="Keeping compatible field classes")
    extra_columns = [column for column in field.column_names if column not in {"image", "label"}]
    if extra_columns:
        field = field.remove_columns(extra_columns)
    field = field.cast_column("label", ClassLabel(names=labels))
    if len(field) == 0:
        raise ValueError("No field-dataset labels mapped to the current model classes.")
    field_split = field.train_test_split(
        test_size=args.field_eval_size,
        seed=args.seed,
        stratify_by_column="label",
    )
    print(
        f"Mapped {len(field)} field photos; {len(field_split['train'])} train / "
        f"{len(field_split['test'])} held out across {len(set(field['label']))} classes.",
        flush=True,
    )

    train_data = concatenate_datasets([pv_split["train"], field_split["train"]]).shuffle(seed=args.seed)
    processor = AutoImageProcessor.from_pretrained(args.model)
    model = AutoModelForImageClassification.from_pretrained(args.model)
    model.eval()

    augmentation = Compose([
        RandomHorizontalFlip(p=0.5),
        RandomRotation(degrees=12),
        ColorJitter(brightness=0.12, contrast=0.12, saturation=0.10, hue=0.02),
    ])

    def transform(training):
        def apply(batch):
            images = [image.convert("RGB") for image in batch["image"]]
            if training:
                images = [augmentation(image) for image in images]
            result = processor(images, return_tensors="pt")
            result["labels"] = batch["label"]
            return result
        return apply

    train_data = train_data.with_transform(transform(training=True))
    pv_eval = pv_split["test"].with_transform(transform(training=False))
    field_eval = field_split["test"].with_transform(transform(training=False))

    counts = Counter(
        list(pv_split["train"]["label"]) + list(field_split["train"]["label"])
    )
    class_weights = torch.tensor(
        [np.sqrt(max(counts.get(index, 1), 1)) ** -1 for index in range(len(labels))],
        dtype=torch.float32,
    )
    class_weights /= class_weights.mean()

    class BalancedTrainer(Trainer):
        def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
            targets = inputs.pop("labels").long()
            outputs = model(**inputs)
            weights = class_weights.to(outputs.logits.device)
            loss = torch.nn.functional.cross_entropy(outputs.logits, targets, weight=weights)
            return (loss, outputs) if return_outputs else loss

    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    effective_batch_size = args.batch_size * args.gradient_accumulation_steps
    updates_per_epoch = (len(train_data) + effective_batch_size - 1) // effective_batch_size
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.epochs,
        weight_decay=0.02,
        warmup_steps=max(1, round(updates_per_epoch * args.epochs * 0.05)),
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="eval_macro_f1",
        greater_is_better=True,
        remove_unused_columns=False,
        report_to="none",
        seed=args.seed,
        fp16=torch.cuda.is_available() and not bf16,
        bf16=bf16,
        # The transform closure below is not picklable under Windows spawn.
        # Keep loading in the main process so local Windows training works.
        dataloader_num_workers=0,
        logging_steps=100,
    )
    trainer = BalancedTrainer(
        model=model,
        args=training_args,
        data_collator=DefaultDataCollator(),
        train_dataset=train_data,
        eval_dataset=field_eval,
        processing_class=processor,
        compute_metrics=metrics_for,
    )

    print("Measuring the starting model on both held-out sets...", flush=True)
    before_field = trainer.evaluate(field_eval, metric_key_prefix="field_before")
    before_pv = trainer.evaluate(pv_eval, metric_key_prefix="plantvillage_before")
    print("Starting field score:", before_field, flush=True)
    print("Starting PlantVillage score:", before_pv, flush=True)

    trainer.train()
    after_field = trainer.evaluate(field_eval, metric_key_prefix="field_after")
    after_pv = trainer.evaluate(pv_eval, metric_key_prefix="plantvillage_after")
    trainer.save_model(args.output_dir)
    processor.save_pretrained(args.output_dir)

    field_gain = after_field.get("field_after_macro_f1", 0) - before_field.get("field_before_macro_f1", 0)
    pv_change = after_pv.get("plantvillage_after_accuracy", 0) - before_pv.get("plantvillage_before_accuracy", 0)
    report = {
        "base_model": args.model,
        "field_dataset": args.field_dataset,
        "mapped_field_images": len(field),
        "before_field": before_field,
        "after_field": after_field,
        "before_plantvillage": before_pv,
        "after_plantvillage": after_pv,
        "field_macro_f1_gain": field_gain,
        "plantvillage_accuracy_change": pv_change,
        "publish_recommended": field_gain > 0 and pv_change >= -0.01,
    }
    report_path = Path(args.output_dir) / "training_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2), flush=True)

    if args.hub_model_id and report["publish_recommended"]:
        trainer.push_to_hub()
        processor.push_to_hub(args.hub_model_id)
        print(f"Published improved checkpoint: https://huggingface.co/{args.hub_model_id}", flush=True)
    elif args.hub_model_id:
        print("Not publishing: the held-out checks did not show a safe improvement.", flush=True)
    else:
        print(f"Candidate model and report saved in {args.output_dir}.", flush=True)


if __name__ == "__main__":
    main()
