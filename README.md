# LeafLens — plant health website

A responsive, single-page plant health website backed by a local Hugging Face image classifier.

## Hugging Face training

`training/train.py` fine-tunes the published 39-class model using PlantVillage images and mapped real-world PlantDoc photos. It keeps held-out samples from both datasets, reports accuracy and macro-F1 before and after fine-tuning, and writes a `training_report.json`. A Hub upload is only attempted when field-photo macro-F1 improves and PlantVillage accuracy does not fall by more than one percentage point.

For the prepared Google Colab workflow, open `training/train_on_colab.ipynb`, choose a GPU runtime, upload `training/train.py`, and run the cells. Locally, install `training/requirements.txt` and run:

```powershell
python training/train.py --model vijayasai69/leaflens-plant-disease --field-dataset Project-AgML/plant_doc_classification --output-dir ./artifacts/leaflens-field-finetuned
```

The default run saves a candidate locally for review. Add `--hub-model-id <your-username>/<model-repo>` to publish only if the held-out comparison passes. PlantDoc is licensed CC BY-SA 4.0; keep its attribution and confirm the model distribution license before publishing a derivative. Training with a GPU is strongly recommended.

## Run the website and model locally

The browser sends a selected photo to the small Python server on this computer. When present, the server uses the locally continued and evaluated field-photo checkpoint; otherwise, it downloads the public LeafLens model from Hugging Face. Image classification runs locally, and the selected photo is not sent to Hugging Face.

In PowerShell:

```powershell
cd C:\Users\vijay\OneDrive\Desktop\ML\plant-health-web
Set-ExecutionPolicy -Scope Process Bypass
.\start_website.ps1
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the PowerShell window running while using the website. Press Ctrl+C in that window to stop it.

The server prefers the locally continued candidate, then falls back to `vijayasai69/leaflens-plant-disease`. Held-out scores are recorded in the local checkpoint's `training_report.json`. Set `HF_MODEL_ID` to override either choice. The candidate has not been published to Hugging Face. If the repository becomes private, set `HF_TOKEN` in the server's environment; never put a Hugging Face token in browser JavaScript or commit it to this project.

The prediction is a model-assisted first look, not a confirmed plant diagnosis. The reported training accuracy is on the curated PlantVillage split and may not reflect garden photos. A public deployment needs a hosted Python backend with the same model-loading code; the Hugging Face model repository by itself is not an inference endpoint.
