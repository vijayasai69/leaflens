# LeafLens

LeafLens is a plant-health website that gives a first look at a plant from a leaf photo. It combines a Hugging Face image-classification model with a local Python web server.

## Features

- Predicts a likely plant and leaf condition from a photo.
- Offers image-quality tips and crop-specific care suggestions.
- Keeps a short scan history in the browser. The history stores labels, dates, and scores; it does not store the photos.
- Runs photo analysis on the computer using the Python server. Photos are not uploaded to Hugging Face.
- Includes a Google Colab notebook for continued training with PlantVillage and PlantDoc data.

## What you need

- Python 3.10 or newer
- Git
- Internet access for installing Python packages and downloading the model the first time you analyze a photo

## Get the project

```bash
git clone https://github.com/vijayasai69/leaflens.git
cd leaflens
```

> **Repository access:** The GitHub repository is currently private. The owner must make it public or add you as a collaborator before you can clone it. The image-classification model is hosted separately on [Hugging Face](https://huggingface.co/vijayasai69/leaflens-plant-disease).

## Install and run on Windows

Open PowerShell in the project folder and run:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-web.txt
.\.venv\Scripts\python.exe server.py
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the terminal open while using LeafLens. Press **Ctrl+C** in the terminal to stop the server.

You can also run `start_website.ps1`; it creates the virtual environment and installs the website dependencies if needed.

## Install and run on macOS or Linux

From a terminal in the project folder, run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-web.txt
python server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Leave the terminal running while you use the site; press **Ctrl+C** to stop it.

## Use LeafLens

1. Open the local website at `http://127.0.0.1:8000`.
2. Select a JPG, PNG, or WEBP photo, up to 10 MB. A close, well-lit photo with one clear leaf works best.
3. Review the photo coach, predicted plant and condition, confidence score, and suggested precautions.
4. Choose **Reset check** to clear the current photo and start another scan.

The scan history is stored in this browser on this device. Use **Clear history** to remove it. Model scores are predictions, not confirmed diagnoses; verify important plant-health decisions with a local horticulture or extension professional.

## Model details

The website uses the public [LeafLens model on Hugging Face](https://huggingface.co/vijayasai69/leaflens-plant-disease) when the locally continued checkpoint is unavailable. The model is not deployed as a hosted inference API: the Python server loads it and performs classification on the computer. The first scan may take longer while model files download and load.

The large model checkpoints and training artifacts are not included in this GitHub repository. The app will use the public Hugging Face model by default. To use a different compatible model, set `HF_MODEL_ID` in the server environment before starting it. If you use a private model, set `HF_TOKEN` in the server environment; never put the token in browser code or commit it.

## Continue training

### Google Colab

1. Open [`training/train_on_colab.ipynb`](training/train_on_colab.ipynb) in Google Colab.
2. Select **Runtime → Change runtime type → T4 GPU** (or another GPU).
3. Upload `training/train.py` when the notebook asks for it, then run the notebook cells in order.
4. Review the held-out PlantVillage and PlantDoc scores in the generated report before publishing a candidate.

### Run training locally

Install the training packages into your environment:

```bash
python -m pip install -r training/requirements.txt
```

Then run:

```bash
python training/train.py --field-dataset Project-AgML/plant_doc_classification --output-dir ./artifacts/leaflens-field-finetuned
```

The script uses the public LeafLens model as its starting point and saves the candidate and evaluation report locally. It does not upload a model by default. To allow an upload after the built-in evaluation gate passes, add `--hub-model-id YOUR_HUGGING_FACE_USERNAME/YOUR_MODEL_REPO` and sign in to Hugging Face first.

PlantDoc is licensed CC BY-SA 4.0. Retain its attribution and check the model and dataset licenses before distributing a derivative. GPU training is recommended.

## Project files

- `server.py` — local web server and image-classification endpoint
- `index.html`, `styles.css`, `script.js` — website interface
- `training/train.py` — training and evaluation script
- `training/train_on_colab.ipynb` — Colab workflow
- `requirements-web.txt` — website and model dependencies
- `training/requirements.txt` — training dependencies
