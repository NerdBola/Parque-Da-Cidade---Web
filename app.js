(() => {
  const STORAGE_KEY = 'parque-da-cidade-map-v1';
  const TAS_STATE_KEY = 'parque-da-cidade-tas-state-v1';
  const TILE_SIZE = 32;
  const MATERIALS = {
    grass: { color: '#74a957', detail: '#8dbd66' },
    sand: { color: '#d8bd7b', detail: '#ead59a' },
    wood: { color: '#98633f', detail: '#754b32' },
    stone: { color: '#89928f', detail: '#a7aeaa' },
  };
  const MATERIAL_NAMES = { grass: 'Grama', sand: 'Areia', wood: 'Madeira', stone: 'Bloco Cinza' };
  const page = document.body.dataset.page;
  const canvas = document.querySelector('#map-canvas');

  function makeMap(width = 24, height = 16, fill = 'grass') {
    return {
      version: 1,
      name: 'Meu parque',
      width,
      height,
      tiles: Array.from({ length: height }, () => Array(width).fill(fill)),
      visitors: [],
    };
  }

  function validateMap(value) {
    if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
        value.width < 1 || value.width > 120 || value.height < 1 || value.height > 90 ||
        !Array.isArray(value.tiles) || value.tiles.length !== value.height ||
        value.tiles.some(row => !Array.isArray(row) || row.length !== value.width ||
          row.some(tile => tile !== null && !Object.hasOwn(MATERIALS, tile))) ||
        (value.visitors !== undefined && (!Array.isArray(value.visitors) ||
          value.visitors.some(visitor => !Number.isInteger(visitor.x) || !Number.isInteger(visitor.y) ||
            visitor.x < 0 || visitor.y < 0 || visitor.x >= value.width || visitor.y >= value.height)))) {
      throw new Error('O arquivo não contém um mapa válido.');
    }
    return {
      version: 1,
      name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 40) : 'Meu parque',
      width: value.width,
      height: value.height,
      tiles: value.tiles,
      visitors: value.visitors || [],
    };
  }

  function paintMap(context, map, showGrid = false) {
    context.canvas.width = map.width * TILE_SIZE;
    context.canvas.height = map.height * TILE_SIZE;
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);

    map.tiles.forEach((row, y) => row.forEach((tile, x) => {
      const left = x * TILE_SIZE;
      const top = y * TILE_SIZE;
      const material = MATERIALS[tile];
      context.fillStyle = material ? material.color : '#d2ddc6';
      context.fillRect(left, top, TILE_SIZE, TILE_SIZE);
      if (material) {
        context.fillStyle = material.detail;
        if (tile === 'grass' || tile === 'sand') {
          context.fillRect(left + 7, top + 8, 2, 2);
          context.fillRect(left + 22, top + 21, 2, 2);
          context.fillRect(left + 17, top + 5, 1, 1);
        } else if (tile === 'wood') {
          context.fillRect(left, top + 8, TILE_SIZE, 2);
          context.fillRect(left, top + 23, TILE_SIZE, 2);
          context.fillStyle = '#bd8a5d';
          context.fillRect(left + 8, top + 14, 2, 2);
          context.fillRect(left + 23, top + 2, 2, 2);
        } else {
          context.fillRect(left + 3, top + 13, 9, 2);
          context.fillRect(left + 20, top + 5, 8, 2);
          context.fillRect(left + 14, top + 25, 10, 2);
        }
      }
      if (showGrid) {
        context.strokeStyle = 'rgba(22, 45, 34, .24)';
        context.lineWidth = 1;
        context.strokeRect(left + .5, top + .5, TILE_SIZE - 1, TILE_SIZE - 1);
      }
    }));

    map.visitors.forEach(visitor => {
      const centerX = visitor.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = visitor.y * TILE_SIZE + TILE_SIZE / 2;
      context.beginPath();
      context.arc(centerX, centerY, 9, 0, Math.PI * 2);
      context.fillStyle = '#f2c98f';
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = '#493b2d';
      context.stroke();
      context.beginPath();
      context.arc(centerX - 3, centerY, 1, 0, Math.PI * 2);
      context.arc(centerX + 3, centerY, 1, 0, Math.PI * 2);
      context.fillStyle = '#493b2d';
      context.fill();
    });
  }

  function readFile(file, callback) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        callback(validateMap(JSON.parse(reader.result)));
      } catch (error) {
        window.alert(error instanceof SyntaxError ? 'Não foi possível ler o JSON do mapa.' : error.message);
      }
    };
    reader.onerror = () => window.alert('Não foi possível abrir esse arquivo.');
    reader.readAsText(file);
  }

  function downloadMap(map) {
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${map.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'mapa'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function attachImport(input, callback) {
    input?.addEventListener('change', event => {
      readFile(event.target.files[0], callback);
      event.target.value = '';
    });
  }

  function countTiles(map) {
    return map.tiles.flat().filter(Boolean).length;
  }

  function describeMapContents(map) {
    const visitors = map.visitors.length;
    return `${countTiles(map)} blocos · ${visitors} ${visitors === 1 ? 'visitante' : 'visitantes'}`;
  }

  function setupLoader() {
    const viewport = document.querySelector('.map-viewport');
    const status = document.querySelector('#loader-status');
    const name = document.querySelector('#map-name');
    const size = document.querySelector('#map-size');
    const count = document.querySelector('#tile-count');
    const tasStatus = document.querySelector('#tas-status');
    const frameLabel = document.querySelector('#tas-frame');
    const speedLabel = document.querySelector('#tas-speed');
    let map = null;
    let frame = 0;
    let playbackRate = 1;
    let recording = null;
    let lastTap = null;
    let playbackTimer = null;
    let playbackFrame = 0;
    let playbackTotalFrames = 0;

    const clone = value => JSON.parse(JSON.stringify(value));
    const updateFrameLabel = () => { frameLabel.textContent = `FRAME ${String(frame).padStart(6, '0')}`; };
    const stopPlayback = () => {
      if (playbackTimer !== null) window.clearInterval(playbackTimer);
      playbackTimer = null;
      document.querySelector('#replay-tap').textContent = '↻ Replay';
    };

    const schedulePlayback = () => {
      if (playbackTimer !== null) window.clearInterval(playbackTimer);
      playbackTimer = window.setInterval(() => {
        playbackFrame += 1;
        const directionsForFrame = lastTap.inputs.filter(input => input.frame === playbackFrame);
        if (directionsForFrame.length) directionsForFrame.forEach(input => advanceFrame(input.direction, true));
        else advanceFrame(null, true);
        if (playbackFrame >= playbackTotalFrames) {
          stopPlayback();
          tasStatus.textContent = `Replay concluído em ${frame} frames.`;
        }
      }, Math.max(1, 1000 / (60 * playbackRate)));
    };

    const moveVisitor = direction => {
      if (!map || !map.visitors.length) return false;
      const deltas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const [deltaX, deltaY] = deltas[direction];
      const visitor = map.visitors[0];
      const nextX = visitor.x + deltaX;
      const nextY = visitor.y + deltaY;
      if (nextX < 0 || nextY < 0 || nextX >= map.width || nextY >= map.height) return false;
      visitor.x = nextX;
      visitor.y = nextY;
      return true;
    };

    const advanceFrame = (direction = null, replaying = false) => {
      if (!map) {
        tasStatus.textContent = 'Carregue um mapa antes de avançar frames.';
        return;
      }
      frame += 1;
      if (direction) {
        moveVisitor(direction);
        if (recording && !replaying) recording.inputs.push({ frame, direction });
      }
      paintMap(canvas.getContext('2d'), map);
      count.textContent = describeMapContents(map);
      updateFrameLabel();
      if (!replaying) {
        status.textContent = direction && map.visitors.length
          ? `Visitante em ${map.visitors[0].x + 1}, ${map.visitors[0].y + 1}.`
          : `${map.name} · frame ${frame}.`;
        if (direction) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch { /* State can still be exported as a TAS file. */ }
        }
      }
    };

    const validateTap = value => {
      if (!value || value.format !== 'parque-da-cidade-tas' || value.version !== 1 ||
          !Array.isArray(value.inputs) || value.inputs.some(input =>
            !Number.isInteger(input.frame) || input.frame < 1 ||
            !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(input.direction))) {
        throw new Error('O arquivo .tap não é um replay válido deste simulador.');
      }
      const baseMap = validateMap(value.map);
      const inputs = value.inputs.slice().sort((a, b) => a.frame - b.frame);
      const totalFrames = Number.isInteger(value.totalFrames) && value.totalFrames >= 0
        ? value.totalFrames
        : inputs.at(-1)?.frame || 0;
      if (inputs.some(input => input.frame > totalFrames)) throw new Error('O arquivo .tap possui frames inválidos.');
      return { format: value.format, version: 1, map: baseMap, totalFrames, inputs };
    };

    const downloadTap = tap => {
      const blob = new Blob([JSON.stringify(tap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${tap.map.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'replay'}.tap`;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    const updateExportButton = () => { document.querySelector('#export-tap').disabled = !lastTap; };

    const showMap = loaded => {
      stopPlayback();
      map = loaded;
      frame = 0;
      updateFrameLabel();
      paintMap(canvas.getContext('2d'), map);
      viewport.classList.add('has-map');
      name.textContent = map.name.toUpperCase();
      size.textContent = `${map.width} × ${map.height}`;
      count.textContent = describeMapContents(map);
      status.textContent = 'Mapa carregado para visualização.';
      tasStatus.textContent = map.visitors.length
        ? 'Pronto para gravar movimentos do visitante.'
        : 'Adicione um visitante no editor para gravar movimentos.';
    };

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) showMap(validateMap(JSON.parse(saved)));
    } catch {
      status.textContent = 'Não foi possível carregar o mapa salvo.';
    }

    attachImport(document.querySelector('#map-file'), showMap);
    canvas.addEventListener('click', () => {
      if (map) status.textContent = `${map.name} · ${map.width} × ${map.height}`;
    });
    document.addEventListener('keydown', event => {
      if (!map || !map.visitors.length ||
          (event.target instanceof Element && event.target.matches('input, textarea, select, [contenteditable="true"]'))) return;
      const directions = {
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight',
      };
      const direction = directions[event.key] || directions[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault();
      if (playbackTimer !== null) return;
      advanceFrame(direction);
    });

    document.querySelector('#save-state').addEventListener('click', () => {
      if (!map) { tasStatus.textContent = 'Carregue um mapa antes de salvar o estado.'; return; }
      try {
        localStorage.setItem(TAS_STATE_KEY, JSON.stringify({ map, frame }));
        tasStatus.textContent = `Estado salvo no frame ${frame}.`;
      } catch {
        tasStatus.textContent = 'Não foi possível salvar o estado neste navegador.';
      }
    });
    document.querySelector('#load-state').addEventListener('click', () => {
      try {
        const saved = localStorage.getItem(TAS_STATE_KEY);
        if (!saved) { tasStatus.textContent = 'Nenhum Save State encontrado neste navegador.'; return; }
        const state = JSON.parse(saved);
        if (!Number.isInteger(state.frame) || state.frame < 0) throw new Error('Save State inválido.');
        showMap(validateMap(state.map));
        frame = state.frame;
        updateFrameLabel();
        tasStatus.textContent = `Estado carregado no frame ${frame}.`;
      } catch (error) {
        tasStatus.textContent = error.message || 'Não foi possível carregar o estado.';
      }
    });
    document.querySelector('#frame-advance').addEventListener('click', () => advanceFrame());
    document.querySelector('#slow-down').addEventListener('click', () => {
      playbackRate = Math.max(.25, playbackRate / 2);
      speedLabel.textContent = `${playbackRate}×`;
      if (playbackTimer !== null) schedulePlayback();
      tasStatus.textContent = `Velocidade: ${playbackRate}×.`;
    });
    document.querySelector('#fast-forward').addEventListener('click', () => {
      playbackRate = Math.min(8, playbackRate * 2);
      speedLabel.textContent = `${playbackRate}×`;
      if (playbackTimer !== null) schedulePlayback();
      tasStatus.textContent = `Velocidade: ${playbackRate}×.`;
    });
    document.querySelector('#record-tap').addEventListener('click', event => {
      if (!map) { tasStatus.textContent = 'Carregue um mapa antes de gravar.'; return; }
      if (!map.visitors.length) { tasStatus.textContent = 'Adicione um visitante no editor antes de gravar.'; return; }
      if (recording) {
        lastTap = {
          format: 'parque-da-cidade-tas', version: 1, map: recording.map,
          totalFrames: frame, inputs: recording.inputs,
        };
        recording = null;
        event.currentTarget.classList.remove('is-recording');
        event.currentTarget.innerHTML = '<span class="record-dot" aria-hidden="true"></span> Gravar .tap';
        updateExportButton();
        tasStatus.textContent = `Gravação concluída: ${lastTap.inputs.length} entradas.`;
        return;
      }
      stopPlayback();
      recording = { map: clone(map), inputs: [] };
      frame = 0;
      updateFrameLabel();
      event.currentTarget.classList.add('is-recording');
      event.currentTarget.innerHTML = '<span class="record-dot" aria-hidden="true"></span> Parar gravação';
      lastTap = null;
      updateExportButton();
      tasStatus.textContent = 'Gravando. Use setas ou WASD para registrar os movimentos.';
    });
    document.querySelector('#export-tap').addEventListener('click', () => {
      if (lastTap) downloadTap(lastTap);
    });
    document.querySelector('#tap-file').addEventListener('change', event => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          lastTap = validateTap(JSON.parse(reader.result));
          updateExportButton();
          tasStatus.textContent = `Replay carregado: ${lastTap.inputs.length} entradas. Pressione Replay.`;
        } catch (error) {
          tasStatus.textContent = error.message || 'Não foi possível ler o arquivo .tap.';
        }
      };
      reader.onerror = () => { tasStatus.textContent = 'Não foi possível abrir esse arquivo .tap.'; };
      reader.readAsText(file);
    });

    function startPlayback() {
      stopPlayback();
      if (!lastTap) { tasStatus.textContent = 'Carregue ou grave um arquivo .tap primeiro.'; return; }
      if (recording) {
        recording = null;
        const recordButton = document.querySelector('#record-tap');
        recordButton.classList.remove('is-recording');
        recordButton.innerHTML = '<span class="record-dot" aria-hidden="true"></span> Gravar .tap';
      }
      showMap(clone(lastTap.map));
      frame = 0;
      playbackFrame = 0;
      updateFrameLabel();
      const lastInputFrame = lastTap.inputs.at(-1)?.frame || 0;
      playbackTotalFrames = Math.max(lastTap.totalFrames || 0, lastInputFrame, 1);
      document.querySelector('#replay-tap').textContent = 'Ⅱ Pausar';
      tasStatus.textContent = `Reproduzindo .tap a ${playbackRate}×.`;
      schedulePlayback();
    }

    document.querySelector('#replay-tap').addEventListener('click', () => {
      if (playbackTimer !== null) {
        stopPlayback();
        tasStatus.textContent = `Replay pausado no frame ${frame}.`;
      } else startPlayback();
    });
  }

  function setupEditor() {
    let map;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      map = saved ? validateMap(JSON.parse(saved)) : makeMap();
    } catch {
      map = makeMap();
    }

    let selectedMaterial = 'grass';
    let painting = false;
    const status = document.querySelector('#editor-status');
    const title = document.querySelector('#map-title');

    const update = () => {
      map.name = title.value.trim().slice(0, 40) || 'Meu parque';
      document.querySelector('#workspace-title').textContent = map.name;
      document.querySelector('#canvas-dimensions').textContent = `${map.width} × ${map.height}`;
      document.querySelector('#tile-count').textContent = describeMapContents(map);
      document.querySelector('#map-width').value = map.width;
      document.querySelector('#map-height').value = map.height;
      paintMap(canvas.getContext('2d'), map, true);
    };

    const save = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
        status.textContent = 'Mapa salvo neste navegador.';
      } catch {
        status.textContent = 'Não foi possível salvar. Exporte o mapa como arquivo JSON.';
      }
    };

    const load = loaded => {
      map = loaded;
      title.value = map.name;
      update();
      status.textContent = 'Mapa importado.';
    };

    const selectMaterial = material => {
      selectedMaterial = material;
      document.querySelectorAll('.material-option').forEach(button => {
        const selected = button.dataset.material === material;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };

    const drawAtPointer = event => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width / TILE_SIZE);
      const y = Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height / TILE_SIZE);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
      const nextTile = selectedMaterial === 'erase' ? null : selectedMaterial;
      if (selectedMaterial === 'visitor') {
        if (!map.visitors.some(visitor => visitor.x === x && visitor.y === y)) {
          map.visitors.push({ x, y });
          paintMap(canvas.getContext('2d'), map, true);
          document.querySelector('#tile-count').textContent = describeMapContents(map);
          status.textContent = 'Visitante posicionado.';
        }
        return;
      }
      let removedVisitor = false;
      if (selectedMaterial === 'erase') {
        const visitorIndex = map.visitors.findIndex(visitor => visitor.x === x && visitor.y === y);
        if (visitorIndex !== -1) {
          map.visitors.splice(visitorIndex, 1);
          removedVisitor = true;
        }
      }
      if (map.tiles[y][x] === nextTile && !removedVisitor) return;
      map.tiles[y][x] = nextTile;
      paintMap(canvas.getContext('2d'), map, true);
      document.querySelector('#tile-count').textContent = describeMapContents(map);
      status.textContent = nextTile ? `${MATERIAL_NAMES[nextTile]} aplicado.` : removedVisitor ? 'Visitante removido.' : 'Bloco apagado.';
    };

    document.querySelectorAll('.material-option').forEach(button => {
      button.addEventListener('click', () => selectMaterial(button.dataset.material));
    });
    document.querySelector('#resize-map').addEventListener('click', () => {
      const width = Math.max(8, Math.min(80, Number(document.querySelector('#map-width').value) || 24));
      const height = Math.max(8, Math.min(60, Number(document.querySelector('#map-height').value) || 16));
      const tiles = Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => map.tiles[y]?.[x] ?? 'grass'));
      map = {
        ...map,
        width,
        height,
        tiles,
        visitors: map.visitors.filter(visitor => visitor.x < width && visitor.y < height),
      };
      update();
      status.textContent = 'Tamanho do mapa atualizado.';
    });
    title.addEventListener('input', update);
    canvas.addEventListener('pointerdown', event => {
      painting = true;
      canvas.setPointerCapture(event.pointerId);
      drawAtPointer(event);
    });
    canvas.addEventListener('pointermove', event => { if (painting) drawAtPointer(event); });
    canvas.addEventListener('pointerup', () => { painting = false; });
    canvas.addEventListener('pointercancel', () => { painting = false; });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    document.querySelector('#save-map').addEventListener('click', save);
    document.querySelector('#export-map').addEventListener('click', () => downloadMap(map));
    attachImport(document.querySelector('#map-file'), load);
    document.addEventListener('keydown', event => {
      if (event.target.matches('input')) return;
      const hotkeys = { '1': 'grass', '2': 'sand', '3': 'wood', '4': 'stone', v: 'visitor', V: 'visitor', e: 'erase', E: 'erase' };
      if (hotkeys[event.key]) selectMaterial(hotkeys[event.key]);
    });
    update();
  }

  if (canvas && page === 'editor') setupEditor();
  if (canvas && page === 'loader') setupLoader();
})();