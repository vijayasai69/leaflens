const fileInput = document.querySelector('#leaf-file');
const dropZone = document.querySelector('#drop-zone');
const preview = document.querySelector('#leaf-preview');
const placeholder = document.querySelector('#preview-placeholder');
const result = document.querySelector('#analysis-result');
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
const photoCoach = document.querySelector('#photo-coach');
const historyPanel = document.querySelector('#scan-history');
const historyList = document.querySelector('#history-list');
const historyStorageKey = 'leaflens.scanHistory.v1';
const legacyHistoryStorageKey = 'verdant.scanHistory.v1';
let currentUrl;
let requestController;

function readScanHistory() {
  try {
    let raw = localStorage.getItem(historyStorageKey);
    if (raw === null) {
      raw = localStorage.getItem(legacyHistoryStorageKey);
      if (raw !== null) {
        localStorage.setItem(historyStorageKey, raw);
        localStorage.removeItem(legacyHistoryStorageKey);
      }
    }
    const saved = JSON.parse(raw || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item && item.label && item.date).slice(0, 6) : [];
  } catch {
    return [];
  }
}

function renderScanHistory() {
  const scans = readScanHistory();
  const entries = scans.map((scan) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    const details = document.createElement('div');
    details.className = 'history-details';
    const label = document.createElement('strong');
    label.textContent = scan.label;
    const date = document.createElement('span');
    date.textContent = new Date(scan.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    details.append(label, date);
    const score = document.createElement('span');
    score.className = 'history-score';
    score.textContent = `${scan.confidence}%`;
    item.append(details, score);
    return item;
  });
  if (!scans.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'Your plant checks will show here after your first successful scan.';
    entries.push(empty);
  }
  historyList.replaceChildren(...entries);
  document.querySelector('#clear-history').hidden = scans.length === 0;
}

function saveScanHistory(scan) {
  try {
    const scans = [scan, ...readScanHistory()].slice(0, 6);
    localStorage.setItem(historyStorageKey, JSON.stringify(scans));
    renderScanHistory();
  } catch {
    // A full or unavailable browser store should not interrupt the plant check.
  }
}

function coachPhoto(image) {
  if (!photoCoach || !image.naturalWidth || !image.naturalHeight) return;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 96 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let brightness = 0;
  let brightnessSquared = 0;
  const count = pixels.length / 4;
  for (let index = 0; index < pixels.length; index += 4) {
    const light = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722);
    brightness += light;
    brightnessSquared += light * light;
  }
  const average = brightness / count;
  const contrast = Math.sqrt(Math.max(0, brightnessSquared / count - average * average));
  const hints = [];
  if (Math.min(image.naturalWidth, image.naturalHeight) < 420) hints.push('Try a closer, higher-resolution photo.');
  if (average < 48) hints.push('More natural light can reveal leaf detail.');
  else if (average > 218) hints.push('Reduce glare or move out of direct sunlight.');
  if (contrast < 25) hints.push('A clearer background or sharper focus may help.');
  photoCoach.classList.toggle('is-good', hints.length === 0);
  photoCoach.classList.toggle('is-warn', hints.length > 0);
  photoCoach.textContent = hints.length ? `Photo tip · ${hints.join(' ')}` : 'Photo looks ready · Good light and visible detail';
  photoCoach.hidden = false;
}

const careRules = [
  { match: /spider.?mites?/, title: 'Spider mite precautions', steps: ['Check leaf undersides and nearby plants for fine webbing or moving specks.', 'Rinse affected foliage, especially underneath, and isolate a potted plant while you monitor it.', 'Keep the plant from becoming drought-stressed; confirm mites before choosing a treatment.'] },
  { match: /late.?blight/, title: 'Late blight precautions', steps: ['Separate a potted plant from other susceptible plants and avoid handling wet foliage.', 'Remove badly affected leaves with clean tools and discard them in household waste; do not compost suspected blight.', 'Avoid overhead watering and contact a local extension service promptly if symptoms are spreading.'] },
  { match: /early.?blight/, title: 'Early blight precautions', steps: ['Remove the lowest badly spotted leaves with clean scissors and discard them away from the garden.', 'Water at soil level and mulch around the base to reduce soil splash onto leaves.', 'Improve spacing and airflow; avoid growing the same crop in that spot next season if practical.'] },
  { match: /bacterial.?spot/, title: 'Bacterial spot precautions', steps: ['Avoid touching or pruning the plant while its leaves are wet; clean tools between plants.', 'Water at soil level, remove severely affected leaves, and discard them rather than composting.', 'Do not save seed or move transplants from an affected plant; confirm the issue before applying any spray.'] },
  { match: /powdery.?mildew/, title: 'Powdery mildew precautions', steps: ['Increase spacing and airflow around the plant and give it the light appropriate for its crop.', 'Remove heavily affected leaves and discard them; clean tools afterward.', 'Water the soil rather than the foliage and avoid excess nitrogen fertilizer.'] },
  { match: /yellow.?leaf.?curl|mosaic.?virus|virus/, title: 'Possible virus precautions', steps: ['Isolate a potted plant and avoid taking cuttings or saving seed from it until the result is confirmed.', 'Clean hands and tools after handling; remove and discard a confirmed severely affected plant.', 'Ask a local extension service to confirm the virus and advise on insect vectors before treating.'] },
  { match: /huanglongbing|citrus.?greening/, title: 'Citrus greening precautions', steps: ['Do not move the plant or grafting material from the site while you seek confirmation.', 'Check with your local agriculture or extension service about testing and reporting guidance.', 'Avoid unverified cures; manage citrus psyllids only with locally approved advice.'] },
  { match: /cedar.*rust|common.?rust|rust/, title: 'Rust precautions', steps: ['Remove badly affected leaves and fallen plant debris; discard rather than composting them.', 'Keep foliage dry where possible and improve airflow between plants.', 'Check nearby leaves regularly and ask a local expert before using a fungicide.'] },
  { match: /scab/, title: 'Scab precautions', steps: ['Collect and discard fallen infected leaves and fruit to reduce carry-over.', 'Prune crowded growth during the appropriate season to improve airflow.', 'Avoid overhead watering and confirm the diagnosis before applying a fungicide.'] },
  { match: /black.?rot/, title: 'Black rot precautions', steps: ['Remove affected leaves, fruit, and plant debris; discard them away from the crop.', 'Clean pruning tools between plants and improve airflow through crowded growth.', 'Avoid prolonged leaf wetness and check nearby plants for new symptoms.'] },
  { match: /esca|black.?measles/, title: 'Esca precautions', steps: ['Mark the affected vine and ask a local grape specialist to confirm the diagnosis.', 'Prune only in dry weather with clean tools, and disinfect tools between vines.', 'Remove dead infected wood as advised locally; avoid unverified trunk treatments.'] },
  { match: /leaf.?scorch/, title: 'Leaf scorch care', steps: ['Remove only badly damaged leaves with clean scissors.', 'Keep soil moisture steady for the crop and make sure excess water can drain.', 'Avoid wetting leaves and check whether heat, drought, or salt stress may be contributing.'] },
  { match: /leaf.?mold|mold/, title: 'Leaf mold precautions', steps: ['Increase spacing and airflow, especially around dense lower foliage.', 'Water at the soil line in the morning and avoid keeping leaves damp overnight.', 'Remove badly affected leaves and discard them; check greenhouse humidity if grown under cover.'] },
  { match: /septoria|gray.?leaf.?spot|target.?spot|leaf.?spot/, title: 'Leaf spot precautions', steps: ['Remove lower, heavily spotted leaves and discard them away from the plant.', 'Mulch exposed soil and water at the base to limit splash onto healthy foliage.', 'Improve airflow and rotate the crop next season where practical.'] },
  { match: /leaf.?blight|blight/, title: 'Leaf blight precautions', steps: ['Remove badly affected leaves with clean tools and discard them away from the crop.', 'Keep foliage dry, water at soil level, and give plants more airflow.', 'Monitor nearby plants and confirm the cause locally before using a treatment.'] },
];

const healthyCareRules = [
  { match: /apple/, steps: ['Water at the base during dry spells and keep the root zone well drained.', 'Remove fallen leaves at the end of the season and keep the canopy open with suitable pruning.', 'Check new growth for scab or rust spots as the season changes.'] },
  { match: /blueberry/, steps: ['Keep the soil acidic and evenly moist, with good drainage.', 'Use mulch around shallow roots and avoid cultivating close to the plant.', 'Check leaves for discoloration and follow a fertilizer formulated for blueberries.'] },
  { match: /cherry/, steps: ['Water deeply during dry periods and avoid leaving roots in soggy soil.', 'Clear fallen leaves and fruit from under the tree.', 'Keep the canopy airy and check leaves after prolonged wet weather.'] },
  { match: /corn/, steps: ['Keep soil moisture steady during active growth and make sure water drains well.', 'Give plants enough spacing for airflow and sunlight.', 'Inspect lower leaves regularly for new spots or rust colored marks.'] },
  { match: /grape/, steps: ['Water at the root zone and let the soil drain between waterings.', 'Keep the vine canopy open so leaves dry quickly after rain.', 'Remove fallen leaves and check nearby vines when wet weather persists.'] },
  { match: /orange/, steps: ['Keep citrus roots in well drained soil and avoid frequent shallow watering.', 'Use a fertilizer intended for citrus at the locally recommended time.', 'Check new shoots for psyllids and unusual yellow mottling.'] },
  { match: /peach/, steps: ['Water at soil level during dry spells and avoid waterlogged roots.', 'Clear fallen leaves and fruit from beneath the tree.', 'Maintain airflow through the canopy and inspect leaves after rain.'] },
  { match: /pepper/, steps: ['Water consistently at soil level and let the topsoil dry slightly between watering.', 'Stake or space plants to keep leaves off the ground and improve airflow.', 'Check new growth and leaf undersides for spots or pests.'] },
  { match: /potato/, steps: ['Keep soil evenly moist but not waterlogged, especially while tubers are forming.', 'Hill soil around stems as the plants grow and rotate the crop next season.', 'Inspect lower leaves for spots and avoid handling plants when wet.'] },
  { match: /raspberry/, steps: ['Water the root zone regularly while allowing excess water to drain.', 'Remove spent canes and keep the patch open to sunlight and airflow.', 'Mulch around, rather than against, the stems and check leaves for new spots.'] },
  { match: /soybean/, steps: ['Avoid waterlogged soil and keep moisture steady during flowering and pod fill.', 'Maintain suitable spacing so the canopy can dry after rain.', 'Check lower leaves and nearby plants for emerging spots.'] },
  { match: /squash/, steps: ['Water at the base and avoid splashing soil onto leaves.', 'Give vines enough space and sunlight for airflow around the foliage.', 'Check older leaves regularly for pale patches or powdery growth.'] },
  { match: /strawberry/, steps: ['Water the soil near the roots and keep the crown above the soil surface.', 'Remove dead leaves and keep runners from making the bed overly crowded.', 'Use clean mulch to keep leaves and fruit from resting on damp soil.'] },
  { match: /tomato/, steps: ['Water deeply at the soil line and keep the watering routine consistent.', 'Stake or cage plants and remove crowded lower growth for airflow.', 'Check lower leaves and the undersides for spots, mold, or pests.'] },
];

function careAdvice(label, healthy, uncertain) {
  const crop = (label.split('___')[0] || 'Plant')
    .replace(/\([^)]*\)/g, '')
    .replace(/_/g, ' ')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (healthy && !uncertain) {
    const rule = healthyCareRules.find((candidate) => candidate.match.test(crop));
    return {
      title: `${crop} · Keep it thriving`,
      steps: rule?.steps || ['Use a steady watering routine suited to this crop and allow excess water to drain.', 'Check new growth and leaf undersides regularly.', 'Give the plant suitable spacing and light for its growing conditions.'],
    };
  }
  if (uncertain && healthy) {
    return {
      title: `${crop} · Gentle steps while you confirm`,
      steps: ['Retake a close, sharp photo of one leaf in even natural light.', 'Inspect nearby leaves and the leaf undersides for changes.', 'Keep to normal crop-specific care; avoid sprays until you have a clearer identification.'],
    };
  }
  const rule = careRules.find((candidate) => candidate.match.test(label));
  if (rule) return { ...rule, title: `${crop} · ${rule.title}` };
  return {
    title: `${crop} · ${uncertain ? 'Gentle precautions while you confirm' : 'Precautions for this possible leaf issue'}`,
    steps: ['Inspect nearby leaves and retake a clear close-up in natural light.', 'Keep foliage dry where practical, provide airflow, and avoid overwatering.', 'Remove only badly affected leaves with clean tools and confirm the cause before treating.'],
  };
}

function renderState({ pill, title, message, foot, loading = false, error = false, confidence = null, advice = null }) {
  result.hidden = false;
  result.classList.toggle('is-loading', loading);
  result.classList.toggle('is-error', error);
  result.classList.toggle('has-advice', Boolean(advice));
  result.setAttribute('aria-busy', String(loading));
  result.querySelector('.result-pill-label').textContent = pill;
  result.querySelector('h3').textContent = title;
  result.querySelector('.result-message').textContent = message;
  result.querySelector('.result-foot span:first-child').textContent = foot;
  const meter = result.querySelector('.confidence');
  const advicePanel = result.querySelector('.low-confidence-advice');
  advicePanel.hidden = !advice;
  if (advice) {
    advicePanel.querySelector('.advice-title').textContent = advice.title;
    advicePanel.querySelector('.advice-list').replaceChildren(
      ...advice.steps.map((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        return item;
      }),
    );
  }
  if (confidence === null) {
    meter.hidden = true;
  } else {
    meter.hidden = false;
    meter.querySelector('.confidence-label').textContent = `Model score · ${confidence}%`;
    meter.querySelector('.confidence-fill').style.width = `${confidence}%`;
  }
}

function formatLabel(label) {
  return label
    .replace(/___/g, ' · ')
    .replace(/_/g, ' ')
    .replace(/\bhealthy\b/i, 'healthy')
    .replace(/\bblight\b/gi, 'blight')
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

async function analyze(file) {
  requestController?.abort();
  requestController = new AbortController();
  renderState({
    pill: 'LOOKING CLOSER',
    title: 'Taking a closer look…',
    message: 'The first check may take a little longer while the model loads.',
    foot: 'Preparing your plant check',
    loading: true,
  });

  const form = new FormData();
  form.append('image', file);
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: form,
      signal: requestController.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || 'The plant check could not be completed.');

    const prediction = payload.predictions?.[0];
    if (!prediction) throw new Error('The model returned no prediction for this photo.');
    const [plantClass] = prediction.label.split('___');
    const plantName = formatLabel(plantClass).replace(/,/g, '').replace(/\s+/g, ' ').trim();
    const label = formatLabel(prediction.label);
    const healthy = /healthy/i.test(prediction.label);
    const confidence = Math.round(prediction.score * 100);
    const needsPrecautions = prediction.score < 0.9;
    const advice = careAdvice(prediction.label, healthy, needsPrecautions);
    const care = needsPrecautions
      ? 'This result is uncertain, so treat it as an early hint rather than a diagnosis. These steps are specific to the model’s suggested class while you confirm it.'
      : healthy
        ? 'The model sees a healthy-looking leaf. Here are a few care reminders for this crop.'
        : 'The image pattern is most consistent with this possible concern. Use these precautions while you confirm it locally.';

    renderState({
      pill: healthy ? 'HEALTH CHECK' : 'POSSIBLE CONCERN',
      title: label,
      message: `Likely plant: ${plantName}. ${care}`,
      foot: 'A helpful first look · Not a confirmed diagnosis',
      confidence,
      advice,
    });
    saveScanHistory({ label, confidence, date: new Date().toISOString() });
  } catch (error) {
    if (error.name === 'AbortError') return;
    renderState({
      pill: 'CHECK UNAVAILABLE',
      title: 'We couldn’t finish this check.',
      message: error.message || 'Please try again with a clear photo of one leaf.',
      foot: 'Choose the photo again to retry',
      error: true,
    });
  }
}

function showPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    renderState({ pill: 'PHOTO NEEDED', title: 'Choose an image file.', message: 'Use a JPG, PNG, or WEBP photo of a leaf.', foot: 'Your photo is not uploaded' , error: true });
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    renderState({ pill: 'PHOTO TOO LARGE', title: 'Choose a smaller photo.', message: 'This check accepts images up to 10 MB.', foot: 'Your photo is not uploaded', error: true });
    return;
  }
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(file);
  preview.src = currentUrl;
  photoCoach.hidden = true;
  preview.addEventListener('load', () => coachPhoto(preview), { once: true });
  preview.hidden = false;
  document.querySelector('#preview-side').classList.add('has-photo');
  placeholder.hidden = true;
  if (location.hash !== '#check') history.replaceState(null, '', '#check');
  document.querySelector('#check').scrollIntoView({ behavior: 'smooth', block: 'start' });
  analyze(file);
}

function resetCheck() {
  requestController?.abort();
  requestController = null;
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = null;
  fileInput.value = '';
  preview.removeAttribute('src');
  preview.hidden = true;
  document.querySelector('#preview-side').classList.remove('has-photo');
  placeholder.hidden = false;
  photoCoach.classList.remove('is-good', 'is-warn');
  photoCoach.textContent = 'Photo coach · Upload a leaf photo to get tips on lighting, detail, and image size.';
  photoCoach.hidden = false;
  result.hidden = true;
  result.classList.remove('is-loading', 'is-error', 'has-advice');
  result.setAttribute('aria-busy', 'false');
  if (location.hash !== '#check') history.replaceState(null, '', '#check');
}

fileInput.addEventListener('change', (event) => showPhoto(event.target.files[0]));
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('is-dragging');
});
dropZone.addEventListener('dragleave', (event) => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragging');
});
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-dragging');
  showPhoto(event.dataTransfer.files[0]);
});

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});
navLinks.addEventListener('click', (event) => {
  if (event.target.closest('a')) {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

document.querySelector('#clear-history').addEventListener('click', () => {
  try {
    localStorage.removeItem(historyStorageKey);
  } catch {
    // Keep the rest of the page usable when browser storage is unavailable.
  }
  renderScanHistory();
});
document.querySelector('#reset-check').addEventListener('click', resetCheck);

renderScanHistory();
