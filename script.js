(function () {
  "use strict";

  const TOTAL_CANDLES = 23;
  const LIGHT_RADIUS = 34; // px, khoảng cách để bật lửa châm được nến

  const scene = document.querySelector(".scene");
  const cake = document.getElementById("cake");
  const topLid = document.getElementById("topLid");
  const candlesLayer = document.getElementById("candles");
  const lighter = document.getElementById("lighter");
  const lighterFlame = document.getElementById("lighterFlame");
  const blowBtn = document.getElementById("blowBtn");
  const congrats = document.getElementById("congrats");
  const confettiContainer = document.getElementById("confetti");
  const photoFrame = document.getElementById("photoFrame");
  const subtitle = document.getElementById("subtitle");
  const starsContainer = document.getElementById("stars");
  const bgm = document.getElementById("bgm");

  // File nhạc của bạn — phát bài này thay cho giai điệu mặc định khi đủ 23 nến.
  const BGM_FILE = "hpbd.mp3";
  let hasCustomSong = false;

  let litCount = 0;
  let allLit = false;
  let celebrationAudioStarted = false;
  let celebrationDone = false;
  let audioCtx = null;
  let songTimeouts = [];
  let songLoopTimer = null;
  let micStream = null;
  let micRaf = null;
  let micAnalyser = null;
  let micData = null;
  let micArmed = false; // chỉ thực sự tính "thổi" từ lúc đủ 23 nến trở đi
  let micCalibrateStart = null;
  let micBaselineSamples = [];
  let micThreshold = Infinity;
  let micRecentHits = [];

  // ---------- Background stars ----------
  function buildStars() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "%";
      s.style.top = Math.random() * 100 + "%";
      s.style.animationDelay = (Math.random() * 2.5).toFixed(2) + "s";
      frag.appendChild(s);
    }
    starsContainer.appendChild(frag);
  }

  // ---------- Build candles on the cake ----------
  function buildCandles() {
    const backCount = 11;
    const frontCount = TOTAL_CANDLES - backCount;

    const positions = [];
    for (let i = 0; i < backCount; i++) {
      positions.push({ fracX: i / (backCount - 1), row: "back" });
    }
    for (let i = 0; i < frontCount; i++) {
      positions.push({ fracX: i / (frontCount - 1), row: "front" });
    }

    positions.forEach((pos, idx) => {
      const candle = document.createElement("div");
      candle.className = "candle";
      candle.dataset.index = idx;
      candle.dataset.fracX = pos.fracX;
      candle.dataset.row = pos.row;

      const stick = document.createElement("div");
      stick.className = "stick";
      const hue = 340 + Math.floor(Math.random() * 30) - 15;
      stick.style.background = `linear-gradient(90deg, #fff, hsl(${hue},80%,80%) 40%, #fff)`;

      const wick = document.createElement("div");
      wick.className = "wick";

      const flame = document.createElement("div");
      flame.className = "flame";

      const glow = document.createElement("div");
      glow.className = "glow";

      candle.appendChild(stick);
      candle.appendChild(wick);
      candle.appendChild(flame);
      candle.appendChild(glow);
      candlesLayer.appendChild(candle);
    });

    positionCandles();
  }

  // Đặt nến bám theo mặt bánh trên cùng (topLid), tính bằng toạ độ thực tế
  // để không bị lệch khi thay đổi kích thước bánh hoặc màn hình.
  function positionCandles() {
    const lidRect = topLid.getBoundingClientRect();
    const cakeRect = cake.getBoundingClientRect();
    const margin = lidRect.width * 0.12;
    const usableWidth = lidRect.width - margin * 2;

    candlesLayer.querySelectorAll(".candle").forEach((c) => {
      const fracX = parseFloat(c.dataset.fracX);
      const row = c.dataset.row;
      const x = lidRect.left - cakeRect.left + margin + fracX * usableWidth;
      const rowOffsetY = row === "back" ? lidRect.height * 0.2 : lidRect.height * 0.62;
      const bottomFromCakeBottom = cakeRect.bottom - (lidRect.top + rowOffsetY);
      c.style.left = x + "px";
      c.style.bottom = bottomFromCakeBottom + "px";
    });
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(positionCandles, 100);
  });

  function getCandleFlameTarget(candleEl) {
    const rect = candleEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top - 6 };
  }

  function lightCandle(candleEl) {
    if (candleEl.classList.contains("lit")) return;
    candleEl.classList.add("lit");
    litCount++;
    if (litCount >= TOTAL_CANDLES && !allLit) {
      onAllCandlesLit();
    }
  }

  function extinguishCandle(candleEl) {
    if (!candleEl.classList.contains("lit")) return;
    candleEl.classList.remove("lit");
    spawnSmoke(candleEl);
  }

  function spawnSmoke(candleEl) {
    const smoke = document.createElement("div");
    smoke.className = "smoke";
    candleEl.appendChild(smoke);
    setTimeout(() => smoke.remove(), 1000);
  }

  // ---------- Lighter drag logic ----------
  let dragging = false;

  function startDrag(e) {
    dragging = true;
    lighter.classList.add("dragging");
    lighter.style.transition = "none";
    moveLighterTo(e);
    lighter.setPointerCapture && e.pointerId != null && lighter.setPointerCapture(e.pointerId);
    startCelebrationOnFirstTouch();
    setupMicStream(); // phòng khi lần xin quyền lúc vào web chưa thành công, thử lại ở cử chỉ chạm đầu tiên
  }

  // Trình duyệt di động (đặc biệt Safari/iOS) chỉ cho phép tạo/mở AudioContext và
  // phát audio khi có một cử chỉ chạm RỜI RẠC (touchstart/pointerdown...), không
  // tính pointermove khi đang kéo. Nên phát nhạc THẬT ngay tại lần chạm đầu tiên
  // vào bật lửa (pointerdown) — vừa đúng lúc người dùng bắt đầu thắp nến, vừa chạy
  // liên tục xuyên suốt sau đó (không có chỗ nào khác gọi lại startCelebrationAudio,
  // nên khi thắp xong hết nến nhạc không bị phát lại từ đầu).
  function startCelebrationOnFirstTouch() {
    if (celebrationAudioStarted) return;
    celebrationAudioStarted = true;

    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    startCelebrationAudio();
  }

  function moveLighterTo(e) {
    const x = e.clientX;
    const y = e.clientY;
    lighter.style.left = x + "px";
    lighter.style.top = y + "px";
    lighter.style.bottom = "auto";
    lighter.style.transform = "translate(-50%, -85%)";
    checkFlameNearCandles(x, y - 90);
  }

  function checkFlameNearCandles(x, y) {
    if (!dragging) return;
    const candles = candlesLayer.querySelectorAll(".candle:not(.lit)");
    candles.forEach((c) => {
      const target = getCandleFlameTarget(c);
      const dist = Math.hypot(target.x - x, target.y - y);
      if (dist < LIGHT_RADIUS) {
        lightCandle(c);
      }
    });
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    lighter.classList.remove("dragging");
    lighter.style.transition = "";
    lighter.style.left = "50%";
    lighter.style.top = "";
    lighter.style.bottom = "26px";
    lighter.style.transform = "translateX(-50%)";
  }

  lighter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startDrag(e);
  });
  window.addEventListener("pointermove", (e) => {
    if (dragging) moveLighterTo(e);
  });
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  // ---------- Web Audio: synthesized "Happy Birthday" tune ----------
  const NOTE_FREQ = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0
  };

  const MELODY = [
    ["G4", 0.25], ["G4", 0.25], ["A4", 0.5], ["G4", 0.5], ["C5", 0.5], ["B4", 1.0],
    ["G4", 0.25], ["G4", 0.25], ["A4", 0.5], ["G4", 0.5], ["D5", 0.5], ["C5", 1.0],
    ["G4", 0.25], ["G4", 0.25], ["G5", 0.5], ["E5", 0.5], ["C5", 0.5], ["B4", 0.5], ["A4", 1.0],
    ["F5", 0.25], ["F5", 0.25], ["E5", 0.5], ["C5", 0.5], ["D5", 0.5], ["C5", 1.2]
  ];

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  let masterOutput = null;

  // Mọi âm thanh tổng hợp (nhạc, vỗ tay, pháo bông) đều đi qua 1 compressor
  // chung trước khi ra loa — cho phép đẩy gain từng tiếng lên cao (to hơn hẳn)
  // mà không bị vỡ tiếng/clipping khi nhiều âm chồng lên nhau cùng lúc.
  function getMasterOutput(ctx) {
    if (!masterOutput) {
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);
      masterOutput = compressor;
    }
    return masterOutput;
  }

  function playNote(freq, startTime, duration) {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.28, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 0.9);
    osc.connect(gain);
    gain.connect(getMasterOutput(ctx));
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playSongOnce() {
    const ctx = getAudioCtx();
    let t = ctx.currentTime + 0.05;
    const beat = 0.42;
    MELODY.forEach(([note, dur]) => {
      playNote(NOTE_FREQ[note], t, dur * beat);
      t += dur * beat;
    });
    return (t - ctx.currentTime) * 1000;
  }

  function startSongLoop() {
    if (!subtitle) return;
    const loop = () => {
      const durationMs = playSongOnce();
      songLoopTimer = setTimeout(loop, durationMs + 400);
    };
    loop();
  }

  function stopSong() {
    if (songLoopTimer) {
      clearTimeout(songLoopTimer);
      songLoopTimer = null;
    }
    if (!bgm.paused) {
      bgm.pause();
      bgm.currentTime = 0;
    }
  }

  // Kiểm tra xem thư mục dự án có file nhạc riêng (BGM_FILE) do người dùng
  // tự thêm vào hay không; nếu có thì dùng file đó thay cho giai điệu tổng hợp.
  function checkCustomSong() {
    fetch(BGM_FILE, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          hasCustomSong = true;
          bgm.src = BGM_FILE;
        }
      })
      .catch(() => {
        // Không tìm thấy file, hoặc đang mở trực tiếp qua file:// — dùng nhạc tổng hợp.
      });
  }

  // ---------- All candles lit ----------
  const BLOW_BTN_DELAY_MS = 10000; // nút thổi nến chỉ hiện sau 10s, ưu tiên thổi bằng mic trước
  let blowBtnRevealTimer = null;

  function onAllCandlesLit() {
    allLit = true;
    scene.classList.add("all-lit");
    subtitle.textContent = "🌟 Hãy nhắm mắt lại và ước một điều gì đó, rồi thổi phù vào mic để tắt nến nhé 🌬️";
    // Nút thổi nến ẩn trước, chỉ hiện sau 10s để ưu tiên trải nghiệm thổi bằng mic.
    blowBtnRevealTimer = setTimeout(() => {
      blowBtn.classList.remove("hidden");
    }, BLOW_BTN_DELAY_MS);
    // Mic đã được xin quyền + lắng nghe sẵn từ lúc vào web (xem setupMicStream ở
    // dưới); giờ mới "vũ trang" cho nó bắt đầu đo mức ồn nền NGAY TẠI THỜI ĐIỂM
    // NÀY (không phải lúc mới vào web) rồi mới tính có ai thổi hay không.
    micArmed = true;
    micCalibrateStart = null;
    micBaselineSamples = [];
    micThreshold = Infinity;
    micRecentHits = [];
  }

  function startCelebrationAudio() {
    if (hasCustomSong) {
      bgm.currentTime = 0;
      bgm.play().catch(() => startSongLoop());
    } else {
      startSongLoop();
    }
  }

  // ---------- Blow out candles ----------
  function blowOutAllCandles() {
    if (celebrationDone) return;
    if (litCount < TOTAL_CANDLES) return;
    celebrationDone = true;
    stopSong();
    stopMic();
    clearTimeout(blowBtnRevealTimer);
    blowBtn.classList.add("hidden");

    const litCandles = Array.from(candlesLayer.querySelectorAll(".candle.lit"));
    litCandles.forEach((c, i) => {
      setTimeout(() => {
        extinguishCandle(c);
        if (i === litCandles.length - 1) {
          setTimeout(showCongrats, 500);
        }
      }, i * 90 + Math.random() * 60);
    });
  }

  blowBtn.addEventListener("click", blowOutAllCandles);

  // ---------- Microphone blow detection (optional) ----------
  const MIC_CALIBRATE_MS = 600; // thời gian đo mức ồn nền, tính TỪ LÚC ĐỦ NẾN (không phải lúc vào web)
  const MIC_MIN_RMS = 0.02; // ngưỡng âm lượng tối thiểu tuyệt đối (thang RMS 0..1)
  const MIC_RMS_MULTIPLIER = 2.0; // ngưỡng = mức ồn nền x2 — phải to hơn hẳn nền mới tính
  const MIC_PITCH_MIN_HZ = 70; // dò cao độ giọng người trong khoảng 70–400Hz…
  const MIC_PITCH_MAX_HZ = 400;
  // …bằng tự tương quan (autocorrelation) trên dạng sóng thời gian thực, KHÔNG dùng
  // phổ tần (FFT bin) — vì đã thử và thấy độ phẳng phổ không đáng tin cậy với giọng
  // trầm (harmonics của FFT bin ở tần số thấp dễ trông "phẳng" giả). Autocorrelation
  // đo trực tiếp việc sóng âm có LẶP LẠI THEO CHU KỲ hay không: giọng nói/hát luôn có
  // cao độ (chu kỳ rõ) bất kể trầm hay bổng, còn hơi thổi là khí loạn lưu — hỗn loạn,
  // gần như không chu kỳ. Giá trị 0..1, càng gần 1 càng "có cao độ" (giống giọng nói).
  const MIC_PERIODICITY_MAX = 0.4;
  const MIC_WINDOW = 18; // ~300ms ở 60fps — đủ dài để phân biệt hơi thổi thật với 1 tiếng vỗ tay/hét ngắn
  const MIC_WINDOW_HITS = 13; // cần ~72% số khung trong cửa sổ đạt điều kiện, tức là LIÊN TỤC chứ không phải 1 chấm nhọn

  let micMinLagSamples = 0;
  let micMaxLagSamples = 0;

  // Xin quyền mic NGAY khi vào web (gọi ở cuối file), không đợi tới lúc đủ nến
  // hay phát nhạc — để có đủ thời gian chờ người dùng chấp nhận, và tránh một số
  // trình duyệt di động chặn getUserMedia nếu gọi quá muộn.
  function setupMicStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    if (micStream) return; // đã xin/khởi tạo rồi thì thôi
    navigator.mediaDevices
      .getUserMedia({
        // Tắt các bộ lọc AGC/khử ồn/khử vọng — trên mobile chúng hay coi tiếng thổi
        // là "nhiễu" rồi triệt tiêu không đều, gây ra hiện tượng lúc nhạy lúc không.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      .then((stream) => {
        micStream = stream;
        const ctx = getAudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        micAnalyser = ctx.createAnalyser();
        // fftSize lớn để buffer thời gian đủ dài chứa trọn ít nhất 1 chu kỳ ở tần số
        // thấp nhất cần dò (70Hz) — cần cho phép tính tự tương quan bên dưới.
        micAnalyser.fftSize = 2048;
        source.connect(micAnalyser);
        micData = new Uint8Array(micAnalyser.fftSize);

        micMinLagSamples = Math.floor(ctx.sampleRate / MIC_PITCH_MAX_HZ);
        micMaxLagSamples = Math.floor(ctx.sampleRate / MIC_PITCH_MIN_HZ);

        micRaf = requestAnimationFrame(micCheckLoop);
      })
      .catch(() => {
        // Chưa được cấp quyền (hoặc bị từ chối) — sẽ thử lại ở cử chỉ chạm đầu
        // tiên vào bật lửa; nút "Thổi nến" vẫn luôn hoạt động nếu mic không dùng được.
      });
  }

  // Đọc 1 khung dữ liệu thời gian thực, trả về độ to (RMS) và độ tuần hoàn cao nhất
  // tìm được trong dải lag ứng với cao độ giọng người.
  function micReadFrame() {
    micAnalyser.getByteTimeDomainData(micData);
    const n = micData.length;
    const x = new Float32Array(n);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const v = (micData[i] - 128) / 128;
      x[i] = v;
      energy += v * v;
    }
    const rms = Math.sqrt(energy / n);

    let periodicity = 0;
    if (energy > 1e-4) {
      for (let lag = micMinLagSamples; lag <= micMaxLagSamples; lag += 2) {
        let sum = 0;
        const lim = n - lag;
        for (let i = 0; i < lim; i++) sum += x[i] * x[i + lag];
        const norm = sum / energy;
        if (norm > periodicity) periodicity = norm;
      }
    }
    return { rms, periodicity };
  }

  // Vòng lặp này chạy liên tục suốt từ lúc mic sẵn sàng, nhưng chỉ THỰC SỰ tính
  // "có thổi hay không" khi micArmed = true (tức là lúc đủ 23 nến) — nhờ vậy mức
  // ồn nền được đo đúng ngay tại thời điểm chuẩn bị thổi, không bị lệch so với
  // lúc mới vào web (có thể yên tĩnh hơn/ồn hơn lúc thổi rất nhiều).
  function micCheckLoop() {
    if (celebrationDone) return;
    if (!micArmed) {
      micRaf = requestAnimationFrame(micCheckLoop);
      return;
    }

    const { rms, periodicity } = micReadFrame();
    if (micCalibrateStart === null) micCalibrateStart = performance.now();
    const elapsed = performance.now() - micCalibrateStart;

    if (elapsed < MIC_CALIBRATE_MS) {
      micBaselineSamples.push(rms);
      micRaf = requestAnimationFrame(micCheckLoop);
      return;
    }
    if (micThreshold === Infinity) {
      const baseline =
        micBaselineSamples.reduce((a, b) => a + b, 0) / (micBaselineSamples.length || 1);
      micThreshold = Math.max(MIC_MIN_RMS, baseline * MIC_RMS_MULTIPLIER);
    }

    // Một khung chỉ tính là "đang thổi" khi VỪA đủ to VỪA KHÔNG có cao độ rõ —
    // giọng nói/hát dù to đến mấy cũng có tính tuần hoàn cao, sẽ bị loại ở đây.
    const isBlowLike = rms > micThreshold && periodicity < MIC_PERIODICITY_MAX;
    micRecentHits.push(isBlowLike ? 1 : 0);
    if (micRecentHits.length > MIC_WINDOW) micRecentHits.shift();
    const hits = micRecentHits.reduce((a, b) => a + b, 0);

    if (micRecentHits.length === MIC_WINDOW && hits >= MIC_WINDOW_HITS) {
      blowOutAllCandles();
      return;
    }
    micRaf = requestAnimationFrame(micCheckLoop);
  }

  function stopMic() {
    if (micRaf) cancelAnimationFrame(micRaf);
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
  }

  // ---------- Congrats + confetti ----------
  const CROWN_HIT_MS = 470; // khớp với mốc 55% của @keyframes crown-drop (0.85s) — lúc vương miện chạm đầu
  const CROWN_START_DELAY_MS = 500; // để ảnh trượt lên gần xong rồi vương miện mới rơi

  function showCongrats() {
    subtitle.textContent = "";
    congrats.classList.remove("hidden");

    // 1) Ảnh trượt lên từ dưới
    photoFrame.classList.add("photo-in");

    // 2) Vương miện rơi từ trên xuống, rơi trúng đầu người trong ảnh
    setTimeout(() => {
      photoFrame.classList.add("crown-in");

      // 3) Khi vương miện chạm đầu — bắn pháo hoa giấy
      setTimeout(() => {
        launchConfetti();
        playApplauseAndFireworks();
      }, CROWN_HIT_MS);
    }, CROWN_START_DELAY_MS);
  }

  // ---------- Synthesized applause + fireworks SFX (không cần file âm thanh riêng) ----------
  // Lên lịch node bằng ctx.currentTime, mà currentTime đứng yên khi ctx đang
  // suspended — nếu không đợi resume() xong mới tính giờ, các lần resume chậm
  // (gọi từ trong chuỗi setTimeout lồng nhau, không phải trực tiếp từ gesture
  // chạm, nên trên mobile có thể mất một khoảng thời gian bất định) sẽ khiến
  // start/stop time đã lên lịch trôi vào quá khứ trước khi ctx thật sự chạy lại
  // — nến tắt xong mà không nghe thấy gì, lúc có lúc không tuỳ tốc độ resume.
  function playApplauseAndFireworks() {
    const ctx = getAudioCtx();
    const schedule = () => {
      playApplause(ctx);
      playFireworks(ctx);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(schedule).catch(schedule);
    } else {
      schedule();
    }
  }

  // Vỗ tay: nhiều tiếng "tách" rải ngẫu nhiên trong ~2.6s, mô phỏng một tràng pháo
  // tay. Dải tần hạ xuống mid (500-3500Hz) và gain/duration tăng so với bản đầu —
  // bản trước dùng dải cao (1200-6000Hz) + gain thấp nên loa điện thoại tái tạo rất
  // yếu và bị tiếng "bùm" pháo bông (100-2500Hz, gain 0.35) lấn át hoàn toàn.
  function playApplause(ctx) {
    const startTime = ctx.currentTime + 0.02;
    const duration = 2.6;
    const clapCount = 50;
    for (let i = 0; i < clapCount; i++) {
      const t = startTime + Math.random() * duration;
      playNoiseBurst(ctx, t, 0.09 + Math.random() * 0.06, 0.9 + Math.random() * 0.4, 500, 3500);
    }
  }

  // Pháo bông: tiếng rít bay lên rồi tiếng "bùm" trầm + crackle nhỏ lách tách sau đó,
  // lặp lại vài đợt lệch giờ nhau như nhiều quả pháo bắn nối tiếp.
  function playFireworks(ctx) {
    const launchDelays = [0, 0.5, 1.1, 1.9];
    launchDelays.forEach((delay) => {
      const t = ctx.currentTime + delay;
      playWhistle(ctx, t, 0.35);
      playNoiseBurst(ctx, t + 0.35, 0.5, 0.65, 100, 2500);
      for (let i = 0; i < 6; i++) {
        playNoiseBurst(ctx, t + 0.4 + Math.random() * 0.5, 0.03, 0.3, 2000, 8000);
      }
    });
  }

  function playNoiseBurst(ctx, startTime, duration, peakGain, freqLow, freqHigh) {
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = (freqLow + freqHigh) / 2;
    bandpass.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + duration * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(getMasterOutput(ctx));
    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  function playWhistle(ctx, startTime, duration) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, startTime);
    osc.frequency.exponentialRampToValueAtTime(1800, startTime + duration);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.25, startTime + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(getMasterOutput(ctx));
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function launchConfetti() {
    const colors = ["#ff6fa5", "#ffd166", "#6fd6ff", "#a0ff6f", "#ff9f6f", "#c88bff"];
    for (let i = 0; i < 120; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = 2.5 + Math.random() * 2.5 + "s";
      piece.style.animationDelay = Math.random() * 1.5 + "s";
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      confettiContainer.appendChild(piece);
    }
  }

  // ---------- Init ----------
  buildStars();
  buildCandles();
  checkCustomSong();
  setupMicStream();
})();
