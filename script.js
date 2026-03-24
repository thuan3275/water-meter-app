// ==================== CẤU HÌNH ====================
const SCRIPT_ID = 'AKfycbzP-blZX0kLeEjOplmQ3PkW1qVNlZccAEAeMFCvaJlcE8YZHqrwWL88EroqLut7XOFWiA';
const SCRIPT_URL = 'https://script.google.com/macros/s/'+ SCRIPT_ID +'/exec'; 
// ← THAY BẰNG LINK WEB APP THỰC TẾ

let videoStream = null;
let photoDataUrl = null;
let currentPosition = null;   // Lưu vị trí GPS

// ==================== LẤY VỊ TRÍ GPS ====================
async function getCurrentPosition() {
  const gpsInfo = document.getElementById('gpsInfo');
  
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      gpsInfo.textContent = '❌ Trình duyệt không hỗ trợ GPS';
      gpsInfo.style.color = 'red';
      reject(new Error('Geolocation not supported'));
      return;
    }

    gpsInfo.textContent = '📍 Đang lấy vị trí GPS...';
    gpsInfo.style.color = '#fbbc05';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentPosition = {
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
          accuracy: Math.round(position.coords.accuracy) + 'm'
        };

        gpsInfo.innerHTML = `
          📍 Vị trí: ${currentPosition.latitude}, ${currentPosition.longitude}<br>
          <small>Độ chính xác: ${currentPosition.accuracy}</small>
        `;
        gpsInfo.style.color = '#34a853';
        resolve(currentPosition);
      },
      (error) => {
        let msg = '❌ Không lấy được GPS: ';
        switch(error.code) {
          case error.PERMISSION_DENIED: msg += 'Bạn đã từ chối quyền vị trí'; break;
          case error.POSITION_UNAVAILABLE: msg += 'Vị trí không khả dụng'; break;
          case error.TIMEOUT: msg += 'Quá thời gian'; break;
          default: msg += error.message;
        }
        gpsInfo.textContent = msg;
        gpsInfo.style.color = 'red';
        reject(error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ==================== KHỞI ĐỘNG CAMERA ====================
async function startCamera() {
  const video = document.getElementById('video');
  const status = document.getElementById('status');

  try {
    const constraints = { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }};
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    await video.play();
    status.textContent = '✅ Camera sẵn sàng';
    status.style.color = '#34a853';
  } catch (err) {
    status.textContent = '❌ Không mở được camera: ' + err.message;
    status.style.color = 'red';
  }
}

// ==================== CHỤP ẢNH + OCR + GPS ====================
document.getElementById('captureBtn').addEventListener('click', async () => {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const preview = document.getElementById('preview');
  const meterInput = document.getElementById('meterInput');
  const saveBtn = document.getElementById('saveBtn');
  const status = document.getElementById('status');

  // Lấy GPS trước hoặc song song
  try {
    await getCurrentPosition();
  } catch (e) {
    if (!confirm('Không lấy được GPS. Vẫn tiếp tục chụp ảnh?')) return;
  }

  if (!video.srcObject) return alert('Camera chưa sẵn sàng!');

  // Chụp ảnh
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const MAX_WIDTH = 800;
  let w = canvas.width, h = canvas.height;
  if (w > MAX_WIDTH) { h = Math.round(h * MAX_WIDTH / w); w = MAX_WIDTH; }

  const resized = document.createElement('canvas');
  resized.width = w; resized.height = h;
  resized.getContext('2d').drawImage(canvas, 0, 0, w, h);

  photoDataUrl = resized.toDataURL('image/jpeg', 0.85);
  preview.src = photoDataUrl;
  preview.style.display = 'block';

  // OCR
  status.textContent = 'Đang nhận diện chỉ số...';
  try {
    const worker = await Tesseract.createWorker(['eng', 'vie']);
    const { data: { text } } = await worker.recognize(photoDataUrl);
    await worker.terminate();

    const extracted = text.replace(/[^0-9.,]/g, '').trim();
    meterInput.value = extracted || '';
  } catch (e) {
    console.error(e);
  }

  saveBtn.disabled = false;
  status.textContent = 'Sẵn sàng lưu (đã có GPS)';
});

// ==================== LƯU DỮ LIỆU ====================
document.getElementById('saveBtn').addEventListener('click', async () => {
  const deviceID = document.getElementById('deviceSelect').value;
  const meterValue = document.getElementById('meterInput').value.trim();
  const status = document.getElementById('status');

  if (!deviceID) return alert('Vui lòng chọn thiết bị!');
  if (!meterValue) return alert('Vui lòng có chỉ số!');

  status.textContent = 'Đang lưu vào Google Sheet...';

  const payload = {
    action: 'uploadImageAndSaveReading',
    imageData: photoDataUrl,
    meterValue: meterValue,
    deviceID: deviceID,
    employeeID: 'Nhân viên di động',
    notes: 'Gửi từ Vercel với GPS',
    latitude: currentPosition ? currentPosition.latitude : '',
    longitude: currentPosition ? currentPosition.longitude : '',
    accuracy: currentPosition ? currentPosition.accuracy : ''
  };

  try {
    const res = await fetch(SCRIPT_URL, {
      redirect: "follow",
      method: 'POST',
      headers: {
      'Content-Type': 'text/plain;charset=utf-8'   // ← Thay đổi quan trọng
      },
      body: JSON.stringify(payload)   // vẫn giữ nguyên body là JSON
    });

    const result = await res.json();

    if (result.success) {
      status.textContent = '✅ Lưu thành công! (Có vị trí GPS)';
      status.style.color = '#34a853';
      
      // Reset
      document.getElementById('preview').style.display = 'none';
      document.getElementById('meterInput').value = '';
      document.getElementById('saveBtn').disabled = true;
      photoDataUrl = null;
      currentPosition = null;
      document.getElementById('gpsInfo').textContent = '📍 Vị trí: Đang lấy GPS...';
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    status.textContent = '❌ Lỗi lưu: ' + err.message;
    status.style.color = 'red';
  }
});

// Load danh sách thiết bị (giữ nguyên như trước)
async function loadDevices() {
  try {
    const res = await fetch(SCRIPT_URL + '?action=getAllDevices', {
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const result = await res.json();
    const data = result.data || result;
    const select = document.getElementById('deviceSelect');
    select.innerHTML = '<option value="">-- Chọn thiết bị --</option>';
    data.slice(1).forEach(row => {
      const opt = document.createElement('option');
      opt.value = row[0];
      opt.textContent = `${row[0]} - ${row[3] || ''}`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Load devices error:', e);
  }
}

window.onload = () => {
  startCamera();
  loadDevices();
};

window.onbeforeunload = () => {
  if (videoStream) videoStream.getTracks().forEach(track => track.stop());
};
