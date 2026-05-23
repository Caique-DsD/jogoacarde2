const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 480;
canvas.height = 640;

const LARGURA = canvas.width;
const ALTURA = canvas.height;

// CORES
const BRANCO = "#ffffff";
const AZUL = "#00bfff";
const VERMELHO = "#ff2b2b";
const VERDE = "#00ff99";
const AMARELO = "#ffe600";

// ══════════════════════════════════════════════════════════════════════════════
// ── SISTEMA DE ÁUDIO (Web Audio API — procedural, leve e estável) ────────────
// ══════════════════════════════════════════════════════════════════════════════
const Audio = (() => {
    let ac = null;          // AudioContext
    let masterGain = null;
    let musicGain = null;
    let sfxGain = null;

    // Controle de loop da música
    let loopTimer = null;
    let estadoMusica = null;  // 'menu' | 'jogo' | 'boss' | null

    // Sons de tiro: throttle para não criar osciladores em excesso (60fps + autofire)
    let ultimoTiro = 0;

    function iniciar() {
        if (ac) return;
        ac = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = ac.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(ac.destination);

        musicGain = ac.createGain();
        musicGain.gain.value = 0.15;
        musicGain.connect(masterGain);

        sfxGain = ac.createGain();
        sfxGain.gain.value = 0.7;
        sfxGain.connect(masterGain);

        // Inicia música do menu após contexto criado
        _iniciarMenuLoop();
    }

    // ── Utilitários internos ────────────────────────────────────────────────

    function _osc(type, freq, vol, dur, dest, freqEnd) {
        if (!ac) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, ac.currentTime);
        if (freqEnd !== undefined)
            o.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + dur);
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.connect(g);
        g.connect(dest || sfxGain);
        o.start(ac.currentTime);
        o.stop(ac.currentTime + dur + 0.01);
    }

    function _noise(dur, vol, hpFreq) {
        if (!ac) return;
        const len = Math.floor(ac.sampleRate * dur);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        g.gain.setValueAtTime(vol, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        if (hpFreq) {
            const f = ac.createBiquadFilter();
            f.type = 'highpass';
            f.frequency.value = hpFreq;
            src.connect(f); f.connect(g);
        } else {
            src.connect(g);
        }
        g.connect(sfxGain);
        src.start(ac.currentTime);
        src.stop(ac.currentTime + dur + 0.01);
    }

    // ── Músicas (agendadas via Web Audio clock — sem setTimeout em excesso) ──

    function pararMusica() {
        if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
        estadoMusica = null;
    }

    // Agenda uma sequência de notas no futuro usando o clock do AudioContext
    // Cada nota tem: { freq, dur (beats), type }
    function _agendarSequencia(notas, bpm, gain, dest, offset, tipo) {
        if (!ac) return;
        const beat = 60 / bpm;
        let t = ac.currentTime + (offset || 0);
        notas.forEach(n => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = tipo || 'sine';
            o.frequency.setValueAtTime(n.freq, t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(gain, t + 0.02);
            g.gain.setValueAtTime(gain, t + n.dur * beat - 0.04);
            g.gain.linearRampToValueAtTime(0, t + n.dur * beat);
            o.connect(g);
            g.connect(dest || musicGain);
            o.start(t);
            o.stop(t + n.dur * beat + 0.05);
            t += n.dur * beat;
        });
        return t - ac.currentTime; // duração total em segundos
    }

    function _kick(t, vol) {
        if (!ac) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(30, t + 0.15);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.2);
    }

    function _hihat(t) {
        if (!ac) return;
        const len = Math.floor(ac.sampleRate * 0.04);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ac.createBufferSource();
        src.buffer = buf;
        const filt = ac.createBiquadFilter();
        filt.type = 'highpass'; filt.frequency.value = 7000;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(filt); filt.connect(g); g.connect(musicGain);
        src.start(t); src.stop(t + 0.05);
    }

    // ── MENU: arpejo suave ───────────────────────────────────────────────────
    function _iniciarMenuLoop() {
        if (estadoMusica !== 'menu') return;
        if (!ac) return;

        const bpm = 96;
        const beat = 60 / bpm;
        const notas = [
            {freq:220, dur:0.5}, {freq:261.63, dur:0.5}, {freq:329.63, dur:0.5},
            {freq:392,  dur:0.5}, {freq:329.63, dur:0.5}, {freq:261.63, dur:0.5},
            {freq:220,  dur:1.0}
        ];

        // melodia
        let t = ac.currentTime;
        notas.forEach(n => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(n.freq, t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.08, t + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.dur * beat);
            o.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + n.dur * beat + 0.05);
            t += n.dur * beat;
        });

        // harmônico acima (mais suave)
        t = ac.currentTime;
        notas.forEach(n => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(n.freq * 2, t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.025, t + 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t + n.dur * beat * 0.8);
            o.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + n.dur * beat + 0.05);
            t += n.dur * beat;
        });

        const duracaoTotal = notas.reduce((s, n) => s + n.dur, 0) * beat * 1000;
        loopTimer = setTimeout(() => {
            if (estadoMusica === 'menu') _iniciarMenuLoop();
        }, duracaoTotal - 50);
    }

    // ── JOGO: batida eletrônica ──────────────────────────────────────────────
    function _iniciarJogoLoop() {
        if (estadoMusica !== 'jogo') return;
        if (!ac) return;

        const bpm = 138;
        const beat = 60 / bpm;
        const bars = 8; // 8 beats por loop

        const now = ac.currentTime;

        // Kicks e hihats
        for (let b = 0; b < bars; b++) {
            const t = now + b * beat;
            if (b % 2 === 0) _kick(t, 0.22);
            if (b % 1 === 0) _hihat(t + beat * 0.5);
        }

        // Melodia
        const melodia = [
            {freq:440, dur:1},{freq:493.88, dur:1},{freq:523.25, dur:1},{freq:493.88, dur:1},
            {freq:440, dur:1},{freq:392, dur:1},{freq:349.23, dur:2},
        ];
        let t = now;
        melodia.forEach(n => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(n.freq, t);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.04, t + 0.01);
            g.gain.setValueAtTime(0.04, t + n.dur * beat - 0.03);
            g.gain.linearRampToValueAtTime(0, t + n.dur * beat);
            o.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + n.dur * beat + 0.02);
            t += n.dur * beat;
        });

        // Baixo
        const baixo = [110, 110, 130.81, 110, 123.47, 110, 98, 110];
        baixo.forEach((freq, i) => {
            const bt = now + i * beat;
            const o = ac.createOscillator();
            const g = ac.createGain();
            const f = ac.createBiquadFilter();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, bt);
            f.type = 'lowpass'; f.frequency.value = 280;
            g.gain.setValueAtTime(0.09, bt);
            g.gain.exponentialRampToValueAtTime(0.001, bt + beat * 0.85);
            o.connect(f); f.connect(g); g.connect(musicGain);
            o.start(bt); o.stop(bt + beat);
        });

        loopTimer = setTimeout(() => {
            if (estadoMusica === 'jogo') _iniciarJogoLoop();
        }, bars * beat * 1000 - 50);
    }

    // ── BOSS: batida tensa ───────────────────────────────────────────────────
    function _iniciarBossLoop() {
        if (estadoMusica !== 'boss') return;
        if (!ac) return;

        const bpm = 155;
        const beat = 60 / bpm;
        const bars = 8;
        const now = ac.currentTime;

        // Kicks pesados
        for (let b = 0; b < bars; b++) {
            const t = now + b * beat;
            if (b % 2 === 0) _kick(t, 0.3);
        }

        // Melodia tensa descendente
        const tensao = [
            {freq:329.63, dur:1},{freq:311.13, dur:1},{freq:293.66, dur:1},
            {freq:261.63, dur:2},{freq:246.94, dur:3},
        ];
        let t = now;
        tensao.forEach(n => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            const f = ac.createBiquadFilter();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(n.freq, t);
            f.type = 'lowpass'; f.frequency.value = 800;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.07, t + 0.03);
            g.gain.setValueAtTime(0.07, t + n.dur * beat - 0.04);
            g.gain.linearRampToValueAtTime(0, t + n.dur * beat);
            o.connect(f); f.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + n.dur * beat + 0.05);
            t += n.dur * beat;
        });

        // Baixo grave pulsante
        for (let b = 0; b < bars; b += 2) {
            const bt = now + b * beat;
            const o = ac.createOscillator();
            const g = ac.createGain();
            const f = ac.createBiquadFilter();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(55, bt);
            f.type = 'lowpass'; f.frequency.value = 180;
            g.gain.setValueAtTime(0.14, bt);
            g.gain.exponentialRampToValueAtTime(0.001, bt + beat * 1.8);
            o.connect(f); f.connect(g); g.connect(musicGain);
            o.start(bt); o.stop(bt + beat * 2);
        }

        loopTimer = setTimeout(() => {
            if (estadoMusica === 'boss') _iniciarBossLoop();
        }, bars * beat * 1000 - 50);
    }

    // ── API pública de músicas ───────────────────────────────────────────────

    function tocarMusicaMenu() {
        if (estadoMusica === 'menu') return;
        pararMusica();
        estadoMusica = 'menu';
        if (ac) _iniciarMenuLoop();
    }

    function tocarMusicaJogo() {
        if (estadoMusica === 'jogo') return;
        pararMusica();
        estadoMusica = 'jogo';
        if (ac) _iniciarJogoLoop();
    }

    function tocarMusicaBoss() {
        if (estadoMusica === 'boss') return;
        pararMusica();
        estadoMusica = 'boss';
        if (ac) _iniciarBossLoop();
    }

    function tocarMusicaGameover() {
        // Toca uma vez; não loopa
        if (estadoMusica === 'gameover') return;
        pararMusica();
        estadoMusica = 'gameover';
        if (!ac) return;
        const notas = [392, 349.23, 311.13, 261.63, 220];
        notas.forEach((freq, i) => {
            _osc('sawtooth', freq, 0.12, 0.55, musicGain);
            // pequeno delay entre notas via frequência agendada no tempo
            const o = ac.createOscillator();
            const g = ac.createGain();
            const t = ac.currentTime + i * 0.28;
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.12, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
            o.connect(g); g.connect(musicGain);
            o.start(t); o.stop(t + 0.58);
        });
    }

    // ── Efeitos sonoros ──────────────────────────────────────────────────────

    function somTiro() {
        if (!ac) return;
        const agora = ac.currentTime;
        if (agora - ultimoTiro < 0.05) return; // throttle: máx 20/s
        ultimoTiro = agora;
        _osc('square', 880, 0.12, 0.09, sfxGain, 440);
    }

    function somExplosao(grande) {
        if (!ac) return;
        _noise(grande ? 0.55 : 0.3, grande ? 0.35 : 0.2);
        _osc('sine', grande ? 90 : 120, grande ? 0.3 : 0.18, grande ? 0.5 : 0.28, sfxGain, 20);
    }

    function somDano() {
        if (!ac) return;
        _noise(0.14, 0.22);
        _osc('sawtooth', 200, 0.18, 0.16, sfxGain, 50);
    }

    function somMorte() {
        if (!ac) return;
        somExplosao(true);
        if (!ac) return;
        const notas = [220, 196, 164.81, 130.81, 110];
        notas.forEach((freq, i) => {
            const t = ac.currentTime + 0.1 + i * 0.16;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            o.connect(g); g.connect(sfxGain);
            o.start(t); o.stop(t + 0.3);
        });
    }

    function somCompra() {
        if (!ac) return;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const t = ac.currentTime + i * 0.1;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.18, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            o.connect(g); g.connect(sfxGain);
            o.start(t); o.stop(t + 0.2);
        });
    }

    function somSemDinheiro() {
        if (!ac) return;
        _osc('square', 200, 0.14, 0.2, sfxGain, 80);
    }

    function somEscudo() {
        if (!ac) return;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(300, ac.currentTime);
        o.frequency.linearRampToValueAtTime(1200, ac.currentTime + 0.12);
        o.frequency.exponentialRampToValueAtTime(600, ac.currentTime + 0.3);
        g.gain.setValueAtTime(0.2, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
        o.connect(g); g.connect(sfxGain);
        o.start(); o.stop(ac.currentTime + 0.38);
    }

    function somBomba() {
        if (!ac) return;
        somExplosao(true);
        _osc('sine', 60, 0.4, 0.5, sfxGain, 20);
    }

    function somTurbo() {
        if (!ac) return;
        _osc('sawtooth', 80, 0.16, 0.28, sfxGain, 400);
    }

    function somBossHit() {
        if (!ac) return;
        _osc('square', 60, 0.15, 0.09, sfxGain, 30);
    }

    function somBossDestruido() {
        if (!ac) return;
        [392, 440, 523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
            const t = ac.currentTime + i * 0.11;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.2, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
            o.connect(g); g.connect(sfxGain);
            o.start(t); o.stop(t + 0.4);
        });
        const tExp = ac.currentTime + 0.65;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(80, tExp);
        o.frequency.exponentialRampToValueAtTime(20, tExp + 0.5);
        g.gain.setValueAtTime(0.35, tExp);
        g.gain.exponentialRampToValueAtTime(0.001, tExp + 0.55);
        o.connect(g); g.connect(sfxGain);
        o.start(tExp); o.stop(tExp + 0.58);
    }

    function somNovaFase() {
        if (!ac) return;
        [523.25, 587.33, 659.25, 783.99].forEach((freq, i) => {
            const t = ac.currentTime + i * 0.08;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.1, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            o.connect(g); g.connect(sfxGain);
            o.start(t); o.stop(t + 0.2);
        });
    }

    function somEnterMenu() {
        if (!ac) return;
        [261.63, 329.63, 392, 523.25].forEach((freq, i) => {
            const t = ac.currentTime + i * 0.07;
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = 'triangle';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.15, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            o.connect(g); g.connect(sfxGain);
            o.start(t); o.stop(t + 0.25);
        });
    }

    return {
        iniciar,
        pararMusica,
        tocarMusicaMenu,
        tocarMusicaJogo,
        tocarMusicaBoss,
        tocarMusicaGameover,
        somTiro,
        somExplosao,
        somDano,
        somMorte,
        somCompra,
        somSemDinheiro,
        somEscudo,
        somBomba,
        somTurbo,
        somBossHit,
        somBossDestruido,
        somNovaFase,
        somEnterMenu,
    };
})();

// Inicializa o áudio e música no primeiro gesto do usuário
function _ativarAudio() {
    Audio.iniciar();
    Audio.tocarMusicaMenu();
}
document.addEventListener("keydown", _ativarAudio, { once: true });
document.addEventListener("mousedown", _ativarAudio, { once: true });

// ESTADOS
const MENU      = 0;
const JOGO      = 1;
const LOJA      = 2;
const GAMEOVER  = 3;
const CUTSCENE  = 4;
const CREDITOS  = 5;

// ── SISTEMA DE TRANSIÇÕES CINEMATOGRÁFICAS ─────────────────────────────────
// fadeGameover: mantido para compatibilidade interna (saída gameover→menu)
let fadeGameover = 0;

// Transição de MORTE (jogo→gameover): duração ~2.5s a 60fps
const TRANS_MORTE = {
    ativo: false,
    prog: 0,           // 0→1
    velocidade: 0.007, // 1/143 frames ≈ 2.4s
    naveX: 0,
    naveY: 0,
    particulasMorte: []
};

// Transição de SAÍDA (gameover→menu): duração ~2.5s
const TRANS_SAIDA = {
    ativo: false,
    prog: 0,
    velocidade: 0.007
};

// Transição de CRÉDITOS→MENU (mesma mecânica)
const TRANS_CREDITOS = {
    ativo: false,
    prog: 0,
    velocidade: 0.007
};

// Classe de partícula especial para morte cinematográfica
class ParticulaMorte {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10 - 2;
        this.raio = Math.random() * 5 + 2;
        this.alpha = 1;
        this.cor = Math.random() < 0.5 ? "#ff4400" : Math.random() < 0.5 ? "#ff9900" : "#ffffff";
        this.decay = Math.random() * 0.012 + 0.008;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.15; // gravidade leve
        this.vx *= 0.97;
        this.alpha -= this.decay;
    }
    desenhar() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowColor = this.cor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = this.cor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.raio, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function iniciarTransicaoMorte() {
    stats.mortes++;
    TRANS_MORTE.ativo = true;
    TRANS_MORTE.prog = 0;
    TRANS_MORTE.naveX = nave.x + nave.tamanho / 2;
    TRANS_MORTE.naveY = nave.y + nave.tamanho / 2;
    TRANS_MORTE.particulasMorte = [];
    // gera 60 partículas de explosão no momento da morte
    for (let i = 0; i < 60; i++) {
        TRANS_MORTE.particulasMorte.push(new ParticulaMorte(TRANS_MORTE.naveX, TRANS_MORTE.naveY));
    }
}

function atualizarTransicaoMorte() {
    if (!TRANS_MORTE.ativo) return;
    TRANS_MORTE.prog += TRANS_MORTE.velocidade;
    TRANS_MORTE.particulasMorte.forEach(p => p.update());
    TRANS_MORTE.particulasMorte = TRANS_MORTE.particulasMorte.filter(p => p.alpha > 0);
    if (TRANS_MORTE.prog >= 1) {
        TRANS_MORTE.ativo = false;
        TRANS_MORTE.prog = 1;
        estado = GAMEOVER;
        Audio.tocarMusicaGameover();
    }
}

function desenharTransicaoMorte() {
    const p = TRANS_MORTE.prog;
    const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p; // easeInOut

    // 1. Slowmo: estrelas param gradualmente (controlado na loop via multiplicador)
    // 2. Partículas de morte
    TRANS_MORTE.particulasMorte.forEach(pm => pm.desenhar());

    // 3. Fade escuro gradual (começa sutil, vai escurecendo)
    const escuridao = ease * 0.88;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${escuridao})`;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.restore();

    // 4. Brilho vermelho pulsante no centro (choque visual)
    if (p < 0.4) {
        const intensidade = (1 - p / 0.4) * (0.5 + 0.5 * Math.sin(Date.now() / 40));
        ctx.save();
        const grad = ctx.createRadialGradient(
            TRANS_MORTE.naveX, TRANS_MORTE.naveY, 0,
            TRANS_MORTE.naveX, TRANS_MORTE.naveY, 140
        );
        grad.addColorStop(0, `rgba(255,80,0,${intensidade * 0.7})`);
        grad.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.restore();
    }

    // 5. Vinheta vermelha nas bordas crescente
    const vig = ease * 0.7;
    ctx.save();
    const gradVig = ctx.createRadialGradient(LARGURA/2, ALTURA/2, ALTURA*0.2, LARGURA/2, ALTURA/2, ALTURA*0.85);
    gradVig.addColorStop(0, "rgba(255,0,0,0)");
    gradVig.addColorStop(1, `rgba(180,0,0,${vig})`);
    ctx.fillStyle = gradVig;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.restore();

    // 6. Texto "KIA" aparece no fim da transição
    if (p > 0.7) {
        const alpha = (p - 0.7) / 0.3;
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.font = "bold 28px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 30;
        ctx.textAlign = "center";
        ctx.fillText("✖  NAVE DESTRUÍDA  ✖", LARGURA / 2, ALTURA / 2);
        ctx.restore();
    }

    // 7. Distorção visual: linhas de scan horizontais sutis
    if (p > 0.3) {
        ctx.save();
        ctx.globalAlpha = (p - 0.3) * 0.12;
        for (let y = 0; y < ALTURA; y += 4) {
            ctx.fillStyle = "rgba(0,0,0,1)";
            ctx.fillRect(0, y, LARGURA, 2);
        }
        ctx.restore();
    }
}

function atualizarTransicaoSaida() {
    if (!TRANS_SAIDA.ativo) return;
    TRANS_SAIDA.prog += TRANS_SAIDA.velocidade;
    if (TRANS_SAIDA.prog >= 1) {
        TRANS_SAIDA.ativo = false;
        TRANS_SAIDA.prog = 0;
        fadeGameover = 0;
        estado = MENU;
    }
}

function desenharTransicaoSaida() {
    if (!TRANS_SAIDA.ativo) return;
    const p = TRANS_SAIDA.prog;
    const ease = p < 0.5 ? 2*p*p : -1+(4-2*p)*p;

    // Fade escuro total → limpo
    const alpha = p < 0.4 ? (p / 0.4) : 1 - ((p - 0.4) / 0.6);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha * 1.2)})`;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    ctx.restore();

    // Linhas de scan (mesmo estilo da morte)
    if (p < 0.5) {
        ctx.save();
        ctx.globalAlpha = (1 - p * 2) * 0.1;
        for (let y = 0; y < ALTURA; y += 4) {
            ctx.fillStyle = "rgba(0,0,0,1)";
            ctx.fillRect(0, y, LARGURA, 2);
        }
        ctx.restore();
    }

    // Flash azul de "retorno" no meio da transição
    if (p > 0.35 && p < 0.55) {
        const f = 1 - Math.abs(p - 0.45) / 0.1;
        ctx.save();
        ctx.fillStyle = `rgba(0,191,255,${f * 0.18})`;
        ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.restore();
    }
}

let estado = MENU;

// VARIÁVEIS
let fase = 1;
let pontuacao = 0;
let dinheiro = 0;

let teclas = {};

let tiros = [];
let asteroides = [];
let explosoes = [];
let particulas = [];

// ── ESTATÍSTICAS DA JORNADA ────────────────────────────────────────────────
let stats = {
    asteroidesDestruidos: 0,
    mortes: 0,
    fasesCompletas: 0,
    tempoInicio: Date.now(),
    tempoJogo: 0  // acumulado em ms (pausado fora do jogo)
};
let tempoJogoAtivo = false; // true quando está no estado JOGO

// ── ASTEROIDE GIGANTE (BOSS) ───────────────────────────────────────────────
const FASE_BOSS = 10;
let bossAtivo = false;
let bossDestruido = false;
const boss = {
    x: 0, y: -320, tamanho: 300,
    vel: 0.25,
    vidaMax: 200, vida: 200,
    rotacao: 0,
    shake: 0,         // intensidade do tremor de câmera
    particulas: [],
    alertaAlpha: 0,   // fade-in do alerta
    entrou: false     // já apareceu na tela
};

function resetarBoss() {
    boss.x = LARGURA / 2 - 150;
    boss.y = -320;
    boss.vida = boss.vidaMax;
    boss.rotacao = 0;
    boss.shake = 0;
    boss.particulas = [];
    boss.alertaAlpha = 0;
    boss.entrou = false;
    bossAtivo = false;
    bossDestruido = false;
}

function ativarBoss() {
    bossAtivo = true;
    boss.x = LARGURA / 2 - 150;
    boss.y = -320;
    boss.vida = boss.vidaMax;
    boss.rotacao = 0;
    boss.particulas = [];
    boss.alertaAlpha = 0;
    boss.entrou = false;
    // remove asteroides normais e para de gerar mais
    asteroides = [];
    Audio.tocarMusicaBoss();
}

function atualizarBoss() {
    if (!bossAtivo || bossDestruido) return;

    boss.rotacao += 0.004;

    // avança até o meio da tela e para
    const bossAlvoY = ALTURA / 2 - boss.tamanho / 2;
    if (boss.y < bossAlvoY) {
        boss.y += boss.vel;
    } else {
        boss.y = bossAlvoY; // trava no centro
    }
    if (boss.y > -50) boss.entrou = true;

    // alerta aparece antes de entrar
    if (!boss.entrou) boss.alertaAlpha = Math.min(1, boss.alertaAlpha + 0.015);

    // tremor de câmera proporcional ao dano sofrido
    const pctVida = boss.vida / boss.vidaMax;
    boss.shake = (1 - pctVida) * 4 + (pctVida < 0.3 ? 3 * Math.sin(Date.now() / 40) : 0);

    // partículas de fissura quando abaixo de 50% vida
    if (pctVida < 0.5 && Math.random() < 0.15) {
        boss.particulas.push({
            x: boss.x + Math.random() * boss.tamanho,
            y: boss.y + Math.random() * boss.tamanho,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            r: Math.random() * 4 + 1,
            alpha: 1,
            cor: Math.random() < 0.5 ? "#ff4400" : "#ff9900"
        });
    }
    boss.particulas.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.025;
    });
    boss.particulas = boss.particulas.filter(p => p.alpha > 0);

    // colisão com tiros
    tiros.forEach((t, i) => {
        if (t.x > boss.x && t.x < boss.x + boss.tamanho &&
            t.y > boss.y && t.y < boss.y + boss.tamanho) {
            tiros.splice(i, 1);
            boss.vida--;
            pontuacao += 5;
            dinheiro += 2;
            Audio.somBossHit();
            // mini-explosão de impacto
            explosoes.push(new Explosao(t.x, t.y + boss.y / 2));
            if (boss.vida <= 0) {
                Audio.somBossDestruido();
                destruirBoss();
            }
        }
    });

    // colisão com nave
    if (!TRANS_MORTE.ativo &&
        nave.x + nave.tamanho > boss.x && nave.x < boss.x + boss.tamanho &&
        nave.y + nave.tamanho > boss.y && nave.y < boss.y + boss.tamanho) {
        if (nave.escudoTimer <= 0) {
            nave.vida--;
            Audio.somDano();
            explosoes.push(new Explosao(nave.x + 35, nave.y + 35));
            if (nave.vida <= 0) { Audio.somMorte(); iniciarTransicaoMorte(); return; }
        }
    }
}

function destruirBoss() {
    bossDestruido = true;
    bossAtivo = false;
    stats.asteroidesDestruidos += boss.vidaMax;
    // explosões em cascata
    for (let i = 0; i < 40; i++) {
        setTimeout(() => {
            explosoes.push(new Explosao(
                boss.x + Math.random() * boss.tamanho,
                boss.y + Math.random() * boss.tamanho
            ));
            for (let j = 0; j < 8; j++) {
                particulas.push(new Particula(
                    boss.x + Math.random() * boss.tamanho,
                    boss.y + Math.random() * boss.tamanho
                ));
            }
        }, i * 80);
    }
    // inicia cutscene após as explosões
    setTimeout(() => iniciarCutscene(), 3500);
}

function desenharBoss() {
    if (!bossAtivo && !bossDestruido) return;
    if (bossDestruido) {
        // partículas residuais
        boss.particulas.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.cor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        return;
    }

    const pct = boss.vida / boss.vidaMax;
    const cx = boss.x + boss.tamanho / 2;
    const cy = boss.y + boss.tamanho / 2;

    // brilho externo ameaçador
    ctx.save();
    const glowR = boss.tamanho / 2 + 30 + 10 * Math.sin(Date.now() / 200);
    const glow = ctx.createRadialGradient(cx, cy, boss.tamanho / 2 - 10, cx, cy, glowR + 40);
    glow.addColorStop(0, `rgba(255,60,0,${0.15 + (1-pct) * 0.25})`);
    glow.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(boss.x - 60, boss.y - 60, boss.tamanho + 120, boss.tamanho + 120);
    ctx.restore();

    // partículas de fissura
    boss.particulas.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.cor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = p.cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // desenha o asteroide gigante rotacionando
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(boss.rotacao);
    // sombra vermelha intensa quando fraco
    if (pct < 0.3) {
        ctx.shadowColor = "#ff2200";
        ctx.shadowBlur = 40;
    }
    ctx.drawImage(asteroideImg, -boss.tamanho / 2, -boss.tamanho / 2, boss.tamanho, boss.tamanho);
    ctx.restore();

    // barra de vida do boss
    if (boss.entrou) {
        const bvW = 300, bvH = 14;
        const bvX = (LARGURA - bvW) / 2, bvY = ALTURA - 50;
        // fundo
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.strokeStyle = "#ff2b2b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        desenharRetArredondado(ctx, bvX - 2, bvY - 2, bvW + 4, bvH + 4, 6);
        ctx.fill(); ctx.stroke();
        ctx.restore();
        // barra
        ctx.save();
        const corBarra = pct > 0.5 ? "#ff4400" : pct > 0.25 ? "#ff6600" : "#ff0000";
        ctx.fillStyle = corBarra;
        ctx.shadowColor = corBarra;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        desenharRetArredondado(ctx, bvX, bvY, bvW * pct, bvH, 4);
        ctx.fill();
        ctx.restore();
        // texto
        ctx.save();
        ctx.font = "bold 11px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.globalAlpha = 0.8;
        ctx.fillText(`☄ ASTEROIDE COLOSSAL — ${boss.vida}/${boss.vidaMax}`, LARGURA / 2, bvY - 8);
        ctx.restore();
    }

    // alerta inicial antes de entrar
    if (!boss.entrou && boss.alertaAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = boss.alertaAlpha * (0.6 + 0.4 * Math.sin(Date.now() / 120));
        ctx.font = "bold 22px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 30;
        ctx.textAlign = "center";
        ctx.fillText("⚠  ASTEROIDE COLOSSAL  ⚠", LARGURA / 2, ALTURA / 2);
        ctx.restore();
    }
}

// ── CUTSCENE FINAL ─────────────────────────────────────────────────────────
const terraImg = new Image();
terraImg.src = "img/terra.png";

const CS = {
    fase: 0,          // 0=foguete acelerando, 1=terra aparece, 2=orbita, 3=pouso, 4=fade créditos
    prog: 0,          // progresso dentro da fase (0→1)
    // posição do foguete na cutscene
    naveX: 0, naveY: 0,
    naveAngle: -Math.PI / 2, // -90° = apontando pra cima
    orbitaAngulo: -Math.PI / 2,
    terraAlpha: 0,
    terraScale: 0.3,
    fadeAlpha: 0,
    particulas: [],
    t: 0             // tempo global da cutscene (frames)
};
const TERRA_X = LARGURA / 2;
const TERRA_Y = 220;
const TERRA_R = 110;
const ORBITA_R = 185;

class ParticulaCS {
    constructor(x, y, cor) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = (Math.random() - 0.5) * 3;
        this.r = Math.random() * 3 + 1;
        this.alpha = 1;
        this.cor = cor || "#00bfff";
        this.decay = Math.random() * 0.01 + 0.005;
    }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= this.decay; }
    draw() {
        if (this.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowColor = this.cor; ctx.shadowBlur = 10;
        ctx.fillStyle = this.cor;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
    }
}

function iniciarCutscene() {
    estado = CUTSCENE;
    CS.fase = 0; CS.prog = 0; CS.t = 0;
    CS.naveX = nave.x + nave.tamanho / 2;
    CS.naveY = nave.y + nave.tamanho / 2;
    CS.naveAngle = -Math.PI / 2;
    CS.orbitaAngulo = -Math.PI / 2;
    CS.terraAlpha = 0;
    CS.terraScale = 0.3;
    CS.fadeAlpha = 0;
    CS.particulas = [];
    stats.tempoJogo = Date.now() - stats.tempoInicio;
    tempoJogoAtivo = false;
}

function atualizarCutscene() {
    CS.t++;
    CS.prog += 0.004; // velocidade base; fases sobrescrevem

    // partículas ambientes
    if (CS.t % 4 === 0) {
        CS.particulas.push(new ParticulaCS(
            Math.random() * LARGURA, Math.random() * ALTURA,
            Math.random() < 0.5 ? "#00bfff" : "#ffffff"
        ));
    }
    CS.particulas.forEach(p => p.update());
    CS.particulas = CS.particulas.filter(p => p.alpha > 0);

    // FASE 0: foguete acelera para cima e sai da tela (dura ~120 frames)
    if (CS.fase === 0) {
        const progF0 = Math.min(1, CS.t / 120);
        // easeIn: começa lento, termina rápido
        const vel = progF0 * progF0 * 18;
        CS.naveY -= vel;
        if (CS.naveY < -120) {
            CS.fase = 1; CS.t = 0;
            CS.terraAlpha = 0; CS.terraScale = 0.3;
        }
    }

    // FASE 1: Terra surge com zoom cinematográfico
    else if (CS.fase === 1) {
        CS.terraAlpha = Math.min(1, CS.t * 0.008);
        CS.terraScale = 0.3 + (1 - 0.3) * Math.min(1, CS.t / 180);
        // posiciona nave entrando de baixo
        CS.naveX = TERRA_X;
        CS.naveY = ALTURA + 80 - Math.min(CS.t * 1.2, ALTURA + 80 - (TERRA_Y + ORBITA_R + 60));
        if (CS.t > 200) { CS.fase = 2; CS.t = 0; CS.orbitaAngulo = Math.PI / 2; }
    }

    // FASE 2: foguete orbita a Terra (2 voltas ≈ 480 frames)
    else if (CS.fase === 2) {
        CS.orbitaAngulo -= 0.022;
        CS.naveX = TERRA_X + Math.cos(CS.orbitaAngulo) * ORBITA_R;
        CS.naveY = TERRA_Y + Math.sin(CS.orbitaAngulo) * ORBITA_R;
        CS.naveAngle = CS.orbitaAngulo + Math.PI / 2;
        // trail de partículas durante a órbita
        if (CS.t % 3 === 0) {
            CS.particulas.push(new ParticulaCS(CS.naveX, CS.naveY, "#00bfff"));
        }
        if (CS.t > 580) { CS.fase = 3; CS.t = 0; }
    }

    // FASE 3: foguete desacelera e para abaixo da Terra
    else if (CS.fase === 3) {
        const prog = Math.min(1, CS.t / 180);
        const eased = 1 - Math.pow(1 - prog, 3);
        const alvoX = TERRA_X;
        const alvoY = TERRA_Y + TERRA_R + 80;
        const origemX = TERRA_X + Math.cos(CS.orbitaAngulo) * ORBITA_R;
        const origemY = TERRA_Y + Math.sin(CS.orbitaAngulo) * ORBITA_R;
        CS.naveX = origemX + (alvoX - origemX) * eased;
        CS.naveY = origemY + (alvoY - origemY) * eased;
        CS.naveAngle = -Math.PI / 2;
        if (CS.t > 220) { CS.fase = 4; CS.t = 0; }
    }

    // FASE 4: fade para créditos
    else if (CS.fase === 4) {
        CS.fadeAlpha = Math.min(1, CS.t * 0.008);
        if (CS.fadeAlpha >= 1) {
            estado = CREDITOS;
            CR.scroll = ALTURA;
            CR.alpha = 0;
            CR.iniciado = Date.now();
        }
    }
}

function desenharCutscene() {
    // fundo estelar mais lento
    estrelas.forEach(e => {
        ctx.beginPath();
        ctx.fillStyle = "white";
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
    });

    // partículas ambiente
    CS.particulas.forEach(p => p.draw());

    // Terra
    if (CS.fase >= 1) {
        const s = CS.terraScale;
        const tw = TERRA_R * 2 * s, th = TERRA_R * 2 * s;

        // brilho ao redor da Terra
        ctx.save();
        ctx.globalAlpha = CS.terraAlpha * 0.5;
        const terraGlow = ctx.createRadialGradient(TERRA_X, TERRA_Y, TERRA_R * s, TERRA_X, TERRA_Y, TERRA_R * s + 60);
        terraGlow.addColorStop(0, "rgba(0,191,255,0.35)");
        terraGlow.addColorStop(1, "rgba(0,100,200,0)");
        ctx.fillStyle = terraGlow;
        ctx.beginPath();
        ctx.arc(TERRA_X, TERRA_Y, TERRA_R * s + 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // imagem da Terra
        ctx.save();
        ctx.globalAlpha = CS.terraAlpha;
        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 40;
        ctx.drawImage(terraImg, TERRA_X - tw / 2, TERRA_Y - th / 2, tw, th);
        ctx.restore();

        // halo atmosférico
        ctx.save();
        ctx.globalAlpha = CS.terraAlpha * (0.3 + 0.1 * Math.sin(Date.now() / 800));
        const halo = ctx.createRadialGradient(TERRA_X, TERRA_Y, TERRA_R * s - 5, TERRA_X, TERRA_Y, TERRA_R * s + 30);
        halo.addColorStop(0, "rgba(100,200,255,0.4)");
        halo.addColorStop(1, "rgba(0,100,200,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(TERRA_X, TERRA_Y, TERRA_R * s + 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Foguete na cutscene
    if (CS.fase === 0 || CS.fase >= 1) {
        ctx.save();
        ctx.translate(CS.naveX, CS.naveY);
        ctx.rotate(CS.naveAngle + Math.PI / 2);
        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 30;
        ctx.drawImage(naveImg, -35, -35, 70, 70);
        ctx.restore();
    }

    // Texto "MISSÃO CONCLUÍDA" na fase 3
    if (CS.fase === 3 && CS.t > 80) {
        const alpha = Math.min(1, (CS.t - 80) / 60);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = "center";
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#00ff99";
        ctx.shadowColor = "#00ff99";
        ctx.shadowBlur = 25;
        ctx.fillText("✦  MISSÃO CONCLUÍDA  ✦", LARGURA / 2, ALTURA - 60);
        ctx.restore();
    }

    // Fade final
    if (CS.fadeAlpha > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${CS.fadeAlpha})`;
        ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.restore();
    }
}

// ── CRÉDITOS / FINAL ──────────────────────────────────────────────────────
const CR = {
    scroll: 0,
    alpha: 0,
    iniciado: 0,
    finalizado: false
};

function tempoFormatado(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function desenharCreditos() {
    // fundo negro estrelado
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    estrelas.forEach(e => {
        ctx.beginPath();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "white";
        ctx.arc(e.x, e.y, e.r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // fade de entrada
    CR.alpha = Math.min(1, CR.alpha + 0.005);
    CR.scroll -= 0.6;

    const cx = LARGURA / 2;
    let y = CR.scroll;

    ctx.save();
    ctx.globalAlpha = CR.alpha;

    function linha(texto, tamanho, cor, bold, dy) {
        ctx.font = `${bold ? "bold " : ""}${tamanho}px Arial`;
        ctx.fillStyle = cor;
        ctx.shadowColor = cor;
        ctx.shadowBlur = cor !== "#ffffff" ? 20 : 5;
        ctx.textAlign = "center";
        ctx.fillText(texto, cx, y + (dy || 0));
        y += tamanho + 10;
    }
    function espaco(n) { y += n || 30; }

    espaco(60);
    linha("★", 48, "#ffe600", true);
    espaco(10);
    linha("FIM DE JORNADA", 32, "#00bfff", true);
    linha("Arcade Shooter PRO+", 14, "#ffffff", false);
    espaco(50);

    linha("✦  SUA JORNADA  ✦", 13, "#00ff99", true);
    espaco(20);
    linha(`Pontuação Final`, 13, "#aaaaaa", false);
    linha(`${pontuacao}`, 38, "#ffffff", true);
    espaco(20);
    linha(`Asteroides Destruídos`, 13, "#aaaaaa", false);
    linha(`${stats.asteroidesDestruidos}`, 32, "#ff9900", true);
    espaco(20);
    linha(`Fases Completadas`, 13, "#aaaaaa", false);
    linha(`${fase}`, 32, "#00bfff", true);
    espaco(20);
    linha(`Tempo de Jornada`, 13, "#aaaaaa", false);
    linha(tempoFormatado(stats.tempoJogo || Date.now() - stats.tempoInicio), 24, "#00ff99", true);
    espaco(20);
    linha(`Dinheiro Acumulado`, 13, "#aaaaaa", false);
    linha(`$${dinheiro}`, 28, "#ffe600", true);
    if (stats.mortes > 0) {
        espaco(20);
        linha(`Vezes que Morreu`, 13, "#aaaaaa", false);
        linha(`${stats.mortes}`, 28, "#ff2b2b", true);
    }
    espaco(50);

    linha("─────────────────────", 14, "#333333", false);
    espaco(20);
    linha("O foguete chegou à Terra.", 15, "#ffffff", false);
    linha("A missão está completa.", 15, "#00bfff", false);
    espaco(30);
    linha("Obrigado por jogar.", 13, "#aaaaaa", false);
    espaco(50);

    linha("ARCADE SHOOTER PRO+", 18, "#00bfff", true);
    linha("v2.0 — Campanha Completa", 12, "#ffffff", false);
    espaco(80);
    linha("Pressione ENTER para jogar novamente", 13, "#ffe600", false);
    espaco(120);

    ctx.restore();

    // ── transição créditos → menu ──────────────────────────────────────────
    if(TRANS_CREDITOS.ativo){
        TRANS_CREDITOS.prog += TRANS_CREDITOS.velocidade;

        const p = TRANS_CREDITOS.prog;

        // fade escuro total na primeira metade, depois abre no menu
        const alpha = p < 0.45 ? p / 0.45 : 1 - ((p - 0.45) / 0.55);
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${Math.min(1, alpha * 1.15)})`;
        ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.restore();

        // flash azul ciano no momento de "aterrissar" no menu (mesmo estilo TRANS_SAIDA)
        if(p > 0.4 && p < 0.56){
            const f = 1 - Math.abs(p - 0.48) / 0.08;
            ctx.save();
            ctx.fillStyle = `rgba(0,191,255,${f * 0.2})`;
            ctx.fillRect(0, 0, LARGURA, ALTURA);
            ctx.restore();
        }

        // linhas de scan sutis saindo
        if(p < 0.45){
            ctx.save();
            ctx.globalAlpha = (1 - p / 0.45) * 0.09;
            for(let sy = 0; sy < ALTURA; sy += 4){
                ctx.fillStyle = "rgba(0,0,0,1)";
                ctx.fillRect(0, sy, LARGURA, 2);
            }
            ctx.restore();
        }

        // quando chegou ao ponto de virada: troca de estado
        if(TRANS_CREDITOS.prog >= 0.48 && !TRANS_CREDITOS._trocou){
            TRANS_CREDITOS._trocou = true;
            resetarJogo();
            estado = MENU;
            Audio.tocarMusicaMenu();
        }

        if(TRANS_CREDITOS.prog >= 1){
            TRANS_CREDITOS.ativo = false;
            TRANS_CREDITOS.prog = 0;
            TRANS_CREDITOS._trocou = false;
        }
    } else {
        // pulso no texto de ENTER quando idle
        const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 600);
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.font = "bold 13px Arial";
        ctx.fillStyle = "#ffe600";
        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 16;
        ctx.textAlign = "center";
        ctx.fillText("↵  ENTER  ↵", LARGURA / 2, ALTURA - 22);
        ctx.restore();
    }
}


// IMAGENS
const fogueteImg = new Image();
fogueteImg.src = "img/foguete.png";

const naveImg = fogueteImg;

const asteroideImg = new Image();
asteroideImg.src = "img/asteroide.png";
// terraImg declarada no bloco de cutscene acima

// ESTRELAS
const estrelas = [];

for(let i=0;i<120;i++){

    estrelas.push({

        x:Math.random()*LARGURA,
        y:Math.random()*ALTURA,
        r:Math.random()*2+1,
        vel:Math.random()*3+1
    });
}

function desenharEstrelas(){

    estrelas.forEach((e)=>{

        ctx.beginPath();

        ctx.fillStyle = "white";

        ctx.arc(e.x,e.y,e.r,0,Math.PI*2);

        ctx.fill();

        e.y += e.vel;

        if(e.y > ALTURA){

            e.y = 0;
            e.x = Math.random()*LARGURA;
        }
    });
}

// PARTÍCULAS
class Particula{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.raio = Math.random()*3+1;

        this.velX = (Math.random()-0.5)*6;
        this.velY = (Math.random()-0.5)*6;

        this.alpha = 1;
    }

    update(){

        this.x += this.velX;
        this.y += this.velY;

        this.alpha -= 0.03;
    }

    desenhar(){

        ctx.save();

        ctx.globalAlpha = this.alpha;

        ctx.fillStyle = "#ff9900";

        ctx.beginPath();

        ctx.arc(this.x,this.y,this.raio,0,Math.PI*2);

        ctx.fill();

        ctx.restore();
    }
}

// NAVE
class Nave{

    constructor(){

        this.x = LARGURA/2 - 35;
        this.y = ALTURA - 100;

        this.tamanho = 70;

        this.vel = 6;

        this.vida = 3;
        this.vidaMax = 3;

        this.cooldown = 0;

        this.tiroDuplo = false;
        this.tiroRapido = false;

        // buffs usáveis (estoque no inventário)
        this.buffEscudo = 0;
        this.buffBomba  = 0;
        this.buffTurbo  = 0;

        // timers ativos (frames)
        this.escudoTimer = 0;
        this.turboTimer  = 0;
    }

    mover(){

        const velAtual = this.turboTimer > 0 ? this.vel * 2 : this.vel;

        if(teclas["a"] || teclas["arrowleft"]){

            this.x -= velAtual;
        }

        if(teclas["d"] || teclas["arrowright"]){

            this.x += velAtual;
        }

        if(this.x < 0){

            this.x = 0;
        }

        if(this.x > LARGURA - this.tamanho){

            this.x = LARGURA - this.tamanho;
        }
    }

    atirar(){

        if(this.cooldown <= 0){

            tiros.push(
                new Tiro(
                    this.x + this.tamanho/2 - 3,
                    this.y
                )
            );

            if(this.tiroDuplo){

                tiros.push(new Tiro(this.x + 10,this.y));

                tiros.push(
                    new Tiro(
                        this.x + this.tamanho - 15,
                        this.y
                    )
                );
            }

            Audio.somTiro();

            this.cooldown = this.tiroRapido ? 6 : 14;
        }
    }

    update(){

        if(this.cooldown > 0) this.cooldown--;
        if(this.escudoTimer > 0) this.escudoTimer--;
        if(this.turboTimer  > 0) this.turboTimer--;
    }

    desenhar(){

        ctx.save();

        // anel do escudo
        if(this.escudoTimer > 0){
            ctx.beginPath();
            ctx.arc(
                this.x + this.tamanho/2,
                this.y + this.tamanho/2,
                this.tamanho/2 + 8,
                0, Math.PI*2
            );
            ctx.strokeStyle = "#00ffff";
            ctx.lineWidth = 2.5;
            ctx.shadowColor = "#00ffff";
            ctx.shadowBlur = 18;
            ctx.globalAlpha = 0.6 + 0.4*Math.sin(Date.now()/80);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.shadowColor = this.turboTimer > 0 ? "#ffe600" : "#00bfff";
        ctx.shadowBlur = 25;

        ctx.drawImage(
            naveImg,
            this.x,
            this.y,
            this.tamanho,
            this.tamanho
        );

        ctx.restore();
    }
}

// ASTEROIDE
class Asteroide{

    constructor(){

        this.tamanho = Math.random()*40+40;

        this.resetar();
    }

    resetar(){

        this.x = Math.random()*(LARGURA-this.tamanho);

        this.y = Math.random()*-500;

        this.vel = Math.random()*3+2+fase*0.4;

        this.rotacao = 0;
    }

    mover(){

        this.y += this.vel;

        this.rotacao += 0.02;

        if(this.y > ALTURA){

            this.resetar();
        }
    }

    desenhar(){

        ctx.save();

        ctx.translate(
            this.x + this.tamanho/2,
            this.y + this.tamanho/2
        );

        ctx.rotate(this.rotacao);

        ctx.drawImage(
            asteroideImg,
            -this.tamanho/2,
            -this.tamanho/2,
            this.tamanho,
            this.tamanho
        );

        ctx.restore();
    }
}

// TIRO
class Tiro{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.largura = 5;
        this.altura = 18;

        this.vel = 12;
    }

    mover(){

        this.y -= this.vel;
    }

    desenhar(){

        ctx.save();

        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 20;

        ctx.fillStyle = "#ffe600";

        ctx.fillRect(
            this.x,
            this.y,
            this.largura,
            this.altura
        );

        ctx.restore();
    }
}

// EXPLOSÃO
class Explosao{

    constructor(x,y){

        this.x = x;
        this.y = y;

        this.raio = 10;

        this.alpha = 1;
    }

    update(){

        this.raio += 3;

        this.alpha -= 0.05;
    }

    desenhar(){

        ctx.save();

        ctx.globalAlpha = this.alpha;

        ctx.strokeStyle = "#ff6600";

        ctx.lineWidth = 4;

        ctx.beginPath();

        ctx.arc(
            this.x,
            this.y,
            this.raio,
            0,
            Math.PI*2
        );

        ctx.stroke();

        ctx.restore();
    }
}

// RESET
function resetarJogo(){

    fase = 1;
    pontuacao = 0;

    tiros = [];
    asteroides = [];
    explosoes = [];
    particulas = [];
    fadeGameover = 0;

    resetarBoss();

    stats.asteroidesDestruidos = 0;
    stats.mortes = 0;
    stats.fasesCompletas = 0;
    stats.tempoInicio = Date.now();
    stats.tempoJogo = 0;
    tempoJogoAtivo = true;

    const dinheiroSalvo   = dinheiro;
    const escudoSalvo     = nave ? nave.buffEscudo   : 0;
    const bombaSalva      = nave ? nave.buffBomba    : 0;
    const turboSalvo      = nave ? nave.buffTurbo    : 0;
    const tiroDuploSalvo  = nave ? nave.tiroDuplo    : false;
    const tiroRapidoSalvo = nave ? nave.tiroRapido   : false;
    const velSalva        = nave ? nave.vel          : 6;
    const vidaMaxSalva    = nave ? nave.vidaMax      : 3;

    nave = new Nave();

    dinheiro          = dinheiroSalvo;
    nave.buffEscudo   = escudoSalvo;
    nave.buffBomba    = bombaSalva;
    nave.buffTurbo    = turboSalvo;
    nave.tiroDuplo    = tiroDuploSalvo;
    nave.tiroRapido   = tiroRapidoSalvo;
    nave.vel          = velSalva;
    nave.vida         = vidaMaxSalva;
    nave.vidaMax      = vidaMaxSalva;

    for(let i = 0; i < 5; i++){
        asteroides.push(new Asteroide());
    }
}

let nave = new Nave();

dinheiro = 0;
resetarJogo();

// COLISÃO
function colisao(a,b){

    return(

        a.x < b.x + b.tamanho &&
        a.x + a.tamanho > b.x &&
        a.y < b.y + b.tamanho &&
        a.y + a.tamanho > b.y
    );
}

// TECLAS
document.addEventListener("keydown",(e)=>{

    teclas[e.key.toLowerCase()] = true;

    if(estado === MENU){

        if(e.key === "Enter"){
            Audio.somEnterMenu();
            resetarJogo();
            estado = JOGO;
            setTimeout(() => Audio.tocarMusicaJogo(), 200);
        }

        if(e.key.toLowerCase() === "l"){
            estado = LOJA;
        }
    }

    if(estado === JOGO && !bossDestruido){

        if(e.key === " "){
            nave.atirar();
        }

        if(e.key.toLowerCase() === "q" && nave.buffEscudo > 0){
            nave.buffEscudo--;
            nave.escudoTimer = 300;
            Audio.somEscudo();
        }

        if(e.key.toLowerCase() === "e" && nave.buffBomba > 0){
            nave.buffBomba--;
            Audio.somBomba();
            asteroides.forEach(ast => {
                explosoes.push(new Explosao(ast.x + ast.tamanho/2, ast.y + ast.tamanho/2));
                for(let i=0;i<10;i++) particulas.push(new Particula(ast.x + ast.tamanho/2, ast.y + ast.tamanho/2));
                pontuacao += 10;
                dinheiro += 5;
                ast.resetar();
            });
        }

        if(e.key.toLowerCase() === "r" && nave.buffTurbo > 0){
            nave.buffTurbo--;
            nave.turboTimer = 240;
            Audio.somTurbo();
        }
    }

    if(estado === LOJA){

        if(e.key === "1" && dinheiro >= 50){ nave.vel += 1;  dinheiro -= 50; Audio.somCompra(); }
        else if(e.key === "1"){ Audio.somSemDinheiro(); }
        if(e.key === "2" && dinheiro >= 80){ nave.tiroDuplo  = true; dinheiro -= 80; Audio.somCompra(); }
        else if(e.key === "2"){ Audio.somSemDinheiro(); }
        if(e.key === "3" && dinheiro >= 70){ nave.tiroRapido = true; dinheiro -= 70; Audio.somCompra(); }
        else if(e.key === "3"){ Audio.somSemDinheiro(); }
        if(e.key === "4" && dinheiro >= 60){ nave.vida++; nave.vidaMax++; dinheiro -= 60; Audio.somCompra(); }
        else if(e.key === "4"){ Audio.somSemDinheiro(); }
        if(e.key === "5" && dinheiro >= 40){ nave.buffEscudo++; dinheiro -= 40; Audio.somCompra(); }
        else if(e.key === "5"){ Audio.somSemDinheiro(); }
        if(e.key === "6" && dinheiro >= 55){ nave.buffBomba++;  dinheiro -= 55; Audio.somCompra(); }
        else if(e.key === "6"){ Audio.somSemDinheiro(); }
        if(e.key === "7" && dinheiro >= 35){ nave.buffTurbo++;  dinheiro -= 35; Audio.somCompra(); }
        else if(e.key === "7"){ Audio.somSemDinheiro(); }

        if(e.key === "Escape"){ estado = MENU; }
    }

    if(estado === GAMEOVER){

        // apenas SHIFT retorna ao menu (com transição suave)
        if(e.key === "Shift" && !TRANS_SAIDA.ativo){
            TRANS_SAIDA.ativo = true;
            TRANS_SAIDA.prog = 0;
            Audio.tocarMusicaMenu();
        }
    }

    if(estado === CREDITOS){
        if(e.key === "Enter" && !TRANS_CREDITOS.ativo){
            TRANS_CREDITOS.ativo = true;
            TRANS_CREDITOS.prog = 0;
        }
    }
});

document.addEventListener("keyup",(e)=>{

    teclas[e.key.toLowerCase()] = false;
});
// CLIQUE DO MOUSE
canvas.addEventListener("mousedown",(e)=>{

    if(estado === JOGO && !bossDestruido){

        // botão esquerdo
        if(e.button === 0){

            nave.atirar();
        }
    }
});
// BARRA VIDA
function desenharVida(){

    ctx.fillStyle = "#400";

    ctx.fillRect(15,15,140,20);

    ctx.fillStyle = "#00ff99";

    ctx.fillRect(
        15,
        15,
        (nave.vida/nave.vidaMax)*140,
        20
    );
}

// RETÂNGULO ARREDONDADO (compatível com todos os browsers)
function desenharRetArredondado(ctx, x, y, w, h, r){
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function hexToRgb(hex){
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
}

// TEXTO GLOW
function textoGlow(texto,x,y,tamanho,cor){

    ctx.save();

    ctx.font = `${tamanho}px Arial`;

    ctx.fillStyle = cor;

    ctx.shadowColor = cor;
    ctx.shadowBlur = 20;

    ctx.fillText(texto,x,y);

    ctx.restore();
}

// LOOP
function loop(){

    ctx.clearRect(0,0,LARGURA,ALTURA);

    // tremor de câmera do boss
    const shakeX = bossAtivo ? (Math.random() - 0.5) * boss.shake * 2 : 0;
    const shakeY = bossAtivo ? (Math.random() - 0.5) * boss.shake * 2 : 0;
    if (shakeX !== 0 || shakeY !== 0) {
        ctx.save();
        ctx.translate(shakeX, shakeY);
    }

    // velocidade das estrelas: diminui durante transição de morte (slow-mo)
    const fatorVel = TRANS_MORTE.ativo ? (1 - TRANS_MORTE.prog * 0.85) :
                     (estado === CUTSCENE || estado === CREDITOS) ? 0.1 : 1;
    if (estado !== CUTSCENE && estado !== CREDITOS) {
        estrelas.forEach((e)=>{
            ctx.beginPath();
            ctx.fillStyle = "white";
            ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
            ctx.fill();
            e.y += e.vel * fatorVel;
            if(e.y > ALTURA){ e.y = 0; e.x = Math.random()*LARGURA; }
        });
    }

    // MENU
    if(estado === MENU){

        const cx = LARGURA / 2;

        // --- linha decorativa topo ---
        ctx.save();
        ctx.strokeStyle = "#00bfff";
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 90);
        ctx.lineTo(LARGURA - 40, 90);
        ctx.stroke();
        ctx.restore();

        // --- subtítulo acima do título ---
        ctx.save();
        ctx.font = "bold 13px Arial";
        ctx.fillStyle = "#00ff99";
        ctx.globalAlpha = 0.85;
        ctx.letterSpacing = "4px";
        ctx.textAlign = "center";
        ctx.fillText("✦  BEM-VINDO AO  ✦", cx, 118);
        ctx.restore();

        // --- título principal ---
        ctx.save();
        ctx.font = "bold 46px Arial";
        ctx.fillStyle = "#00bfff";
        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 30;
        ctx.textAlign = "center";
        ctx.fillText("ARCADE", cx, 168);
        ctx.restore();

        ctx.save();
        ctx.font = "bold 46px Arial";
        ctx.fillStyle = "#00bfff";
        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 30;
        ctx.textAlign = "center";
        ctx.fillText("SHOOTER", cx, 220);
        ctx.restore();

        // --- badge PRO+ ---
        ctx.save();
        ctx.textAlign = "center";
        const badgeW = 80, badgeH = 28;
        const badgeX = cx - badgeW / 2;
        const badgeY = 234;
        ctx.strokeStyle = "#00ff99";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#00ff99";
        ctx.shadowBlur = 12;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
        ctx.font = "bold 15px Arial";
        ctx.fillStyle = "#00ff99";
        ctx.shadowBlur = 14;
        ctx.fillText("PRO +", cx, badgeY + 19);
        ctx.restore();

        // --- nave centralizada ---
        ctx.save();
        ctx.shadowColor = "#00bfff";
        ctx.shadowBlur = 30;
        ctx.drawImage(naveImg, cx - 50, 282, 100, 100);
        ctx.restore();

        // --- linha decorativa separadora ---
        ctx.save();
        ctx.strokeStyle = "#00bfff";
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(60, 410);
        ctx.lineTo(LARGURA - 60, 410);
        ctx.stroke();
        ctx.restore();

        // --- botões de ação centralizados ---
        // ENTER
        ctx.save();
        ctx.textAlign = "center";
        const btnW = 220, btnH = 44;
        const btnX = cx - btnW / 2;

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        desenharRetArredondado(ctx, btnX, 426, btnW, btnH, 8);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 16;
        ctx.textAlign = "center";
        ctx.fillText("ENTER  —  JOGAR", cx, 454);
        ctx.restore();

        // botão LOJA
        ctx.save();
        ctx.strokeStyle = "#ffe600";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = "#ffe600";
        ctx.beginPath();
        desenharRetArredondado(ctx, btnX, 486, btnW, btnH, 8);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#ffe600";
        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 16;
        ctx.textAlign = "center";
        // mostrar saldo se tiver dinheiro
        const labelLoja = dinheiro > 0 ? `L  —  LOJA  ($${dinheiro})` : "L  —  LOJA";
        ctx.fillText(labelLoja, cx, 514);
        ctx.restore();

        // --- linha decorativa rodapé ---
        ctx.save();
        ctx.strokeStyle = "#00bfff";
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 556);
        ctx.lineTo(LARGURA - 40, 556);
        ctx.stroke();
        ctx.restore();

        // --- rodapé versão ---
        ctx.save();
        ctx.font = "12px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.25;
        ctx.textAlign = "center";
        ctx.fillText("v2.0  •  use teclado ou mouse", cx, 580);
        ctx.restore();
    }

    // LOJA
    else if(estado === LOJA){

        const cx = LARGURA / 2;

        // --- linha topo ---
        ctx.save();
        ctx.strokeStyle = "#ffe600";
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 90);
        ctx.lineTo(LARGURA - 40, 90);
        ctx.stroke();
        ctx.restore();

        // --- subtítulo ---
        ctx.save();
        ctx.font = "bold 13px Arial";
        ctx.fillStyle = "#ffe600";
        ctx.globalAlpha = 0.75;
        ctx.textAlign = "center";
        ctx.fillText("✦  ARMAMENTOS  ✦", cx, 116);
        ctx.restore();

        // --- título ---
        ctx.save();
        ctx.font = "bold 44px Arial";
        ctx.fillStyle = "#ffe600";
        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 28;
        ctx.textAlign = "center";
        ctx.fillText("LOJA", cx, 165);
        ctx.restore();

        // --- saldo ---
        const slotW = 140, slotH = 34;
        ctx.save();
        ctx.fillStyle = "rgba(0,255,153,0.1)";
        ctx.strokeStyle = "rgba(0,255,153,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        desenharRetArredondado(ctx, cx - slotW/2, 178, slotW, slotH, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "bold 16px Arial";
        ctx.fillStyle = "#00ff99";
        ctx.shadowColor = "#00ff99";
        ctx.shadowBlur = 12;
        ctx.textAlign = "center";
        ctx.fillText(`$${dinheiro}  disponível`, cx, 200);
        ctx.restore();

        // --- seção MELHORIAS PERMANENTES ---
        ctx.save();
        ctx.font = "bold 11px Arial";
        ctx.fillStyle = "#00bfff";
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "left";
        ctx.fillText("MELHORIAS PERMANENTES", 30, 232);
        ctx.restore();

        const permItens = [
            { tecla:"1", nome:"Velocidade",  desc:"+1 vel permanente",  custo:50,  cor:"#00bfff", comp: nave.vel > 6 },
            { tecla:"2", nome:"Tiro Duplo",  desc:"disparo nas laterais", custo:80, cor:"#ff88ff", comp: nave.tiroDuplo },
            { tecla:"3", nome:"Tiro Rápido", desc:"cadência aumentada",  custo:70,  cor:"#ff88ff", comp: nave.tiroRapido },
            { tecla:"4", nome:"Vida Extra",  desc:"+1 coração",          custo:60,  cor:"#ff4444", comp: false },
        ];

        const cardW = 196, cardH = 52;
        const col1 = 18, col2 = 18 + cardW + 10;
        const row1 = 240, row2 = 240 + cardH + 8;
        const posPerms = [
            {x:col1, y:row1},
            {x:col2, y:row1},
            {x:col1, y:row2},
            {x:col2, y:row2},
        ];

        permItens.forEach((item, i) => {
            const {x, y} = posPerms[i];
            const semDinheiro = dinheiro < item.custo;
            const comprado = item.comp;

            // fundo card
            ctx.save();
            ctx.fillStyle = comprado ? "rgba(0,255,100,0.07)" : semDinheiro ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
            ctx.strokeStyle = comprado ? "rgba(0,255,100,0.4)" : semDinheiro ? "rgba(255,255,255,0.1)" : item.cor + "55";
            ctx.lineWidth = 1;
            ctx.beginPath();
            desenharRetArredondado(ctx, x, y, cardW, cardH, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // tecla badge
            ctx.save();
            ctx.fillStyle = comprado ? "#00ff99" : semDinheiro ? "#555" : item.cor;
            ctx.globalAlpha = 0.9;
            ctx.font = "bold 13px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`[${item.tecla}]`, x + 20, y + 20);
            ctx.restore();

            // nome
            ctx.save();
            ctx.font = "bold 14px Arial";
            ctx.fillStyle = comprado ? "#00ff99" : semDinheiro ? "#666" : "#fff";
            ctx.textAlign = "left";
            ctx.fillText(item.nome, x + 34, y + 20);
            ctx.restore();

            // desc
            ctx.save();
            ctx.font = "11px Arial";
            ctx.fillStyle = "#aaa";
            ctx.globalAlpha = 0.7;
            ctx.textAlign = "left";
            ctx.fillText(item.desc, x + 34, y + 36);
            ctx.restore();

            // custo ou comprado
            ctx.save();
            ctx.font = "bold 13px Arial";
            ctx.fillStyle = comprado ? "#00ff99" : semDinheiro ? "#555" : "#ffe600";
            ctx.textAlign = "right";
            ctx.fillText(comprado ? "✔" : `$${item.custo}`, x + cardW - 10, y + 20);
            ctx.restore();
        });

        // --- seção BUFFS USÁVEIS ---
        ctx.save();
        ctx.font = "bold 11px Arial";
        ctx.fillStyle = "#ff9900";
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "left";
        ctx.fillText("BUFFS USÁVEIS  (ativados no jogo)", 30, 374);
        ctx.restore();

        const buffItens = [
            { tecla:"5", uso:"Q", nome:"Escudo",  desc:"invencível por 5s",  custo:40, cor:"#00ffff", qtd: nave.buffEscudo },
            { tecla:"6", uso:"E", nome:"Bomba",   desc:"destroi tudo na tela",custo:55, cor:"#ff4400", qtd: nave.buffBomba  },
            { tecla:"7", uso:"R", nome:"Turbo",   desc:"velocidade dobrada 4s",custo:35,cor:"#ffe600", qtd: nave.buffTurbo  },
        ];

        const bCardW = 136, bCardH = 64;
        const bY = 382;
        const bXs = [18, 18 + bCardW + 10, 18 + (bCardW + 10)*2];

        buffItens.forEach((item, i) => {
            const x = bXs[i];
            const semDinheiro = dinheiro < item.custo;

            ctx.save();
            ctx.fillStyle = semDinheiro ? "rgba(255,255,255,0.03)" : `rgba(${hexToRgb(item.cor)},0.07)`;
            ctx.strokeStyle = semDinheiro ? "rgba(255,255,255,0.1)" : item.cor + "66";
            ctx.lineWidth = 1;
            ctx.beginPath();
            desenharRetArredondado(ctx, x, bY, bCardW, bCardH, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // tecla compra
            ctx.save();
            ctx.font = "bold 11px Arial";
            ctx.fillStyle = semDinheiro ? "#555" : item.cor;
            ctx.textAlign = "left";
            ctx.fillText(`[${item.tecla}] comprar`, x + 10, bY + 16);
            ctx.restore();

            // nome
            ctx.save();
            ctx.font = "bold 15px Arial";
            ctx.fillStyle = semDinheiro ? "#555" : "#fff";
            ctx.textAlign = "left";
            ctx.fillText(item.nome, x + 10, bY + 33);
            ctx.restore();

            // desc
            ctx.save();
            ctx.font = "10px Arial";
            ctx.fillStyle = "#999";
            ctx.globalAlpha = 0.8;
            ctx.textAlign = "left";
            ctx.fillText(item.desc, x + 10, bY + 46);
            ctx.restore();

            // custo
            ctx.save();
            ctx.font = "bold 12px Arial";
            ctx.fillStyle = semDinheiro ? "#444" : "#ffe600";
            ctx.textAlign = "right";
            ctx.fillText(`$${item.custo}`, x + bCardW - 8, bY + 16);
            ctx.restore();

            // estoque badge
            ctx.save();
            ctx.fillStyle = item.cor + (item.qtd > 0 ? "33" : "11");
            ctx.strokeStyle = item.qtd > 0 ? item.cor : "#333";
            ctx.lineWidth = 1;
            ctx.beginPath();
            desenharRetArredondado(ctx, x + bCardW - 30, bY + 36, 24, 18, 4);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.font = "bold 12px Arial";
            ctx.fillStyle = item.qtd > 0 ? item.cor : "#444";
            ctx.textAlign = "center";
            ctx.fillText(`x${item.qtd}`, x + bCardW - 18, bY + 49);
            ctx.restore();

            // uso in-game tag
            ctx.save();
            ctx.font = "bold 11px Arial";
            ctx.fillStyle = item.qtd > 0 ? item.cor : "#444";
            ctx.textAlign = "right";
            ctx.fillText(`usa [${item.uso}]`, x + bCardW - 8, bY + 60);
            ctx.restore();
        });

        // --- linha separadora rodapé ---
        ctx.save();
        ctx.strokeStyle = "#ffe600";
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 466);
        ctx.lineTo(LARGURA - 40, 466);
        ctx.stroke();
        ctx.restore();

        // botão voltar
        const btnW2 = 200, btnH2 = 42;

        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        desenharRetArredondado(ctx, cx - btnW2/2, 476, btnW2, btnH2, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "bold 17px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.55;
        ctx.textAlign = "center";
        ctx.fillText("ESC  —  VOLTAR AO MENU", cx, 502);
        ctx.restore();

        // rodapé dica
        ctx.save();
        ctx.font = "12px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.2;
        ctx.textAlign = "center";
        ctx.fillText("asteroides dão $5 cada  •  use buffs durante o combate", cx, 560);
        ctx.restore();
    }

    // GAME OVER
    else if(estado === GAMEOVER){

        const cx = LARGURA / 2;

        // atualiza transição de saída se ativa
        atualizarTransicaoSaida();

        // progresso (para compatibilidade visual — 0 enquanto aguarda SHIFT)
        const prog = 0;

        // --- overlay escuro sobre as estrelas ---
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, LARGURA, ALTURA);
        ctx.restore();

        // --- linha topo ---
        ctx.save();
        ctx.strokeStyle = "#ff2b2b";
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 100);
        ctx.lineTo(LARGURA - 40, 100);
        ctx.stroke();
        ctx.restore();

        // --- ícone X decorativo ---
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 48px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.globalAlpha = 0.18;
        ctx.fillText("✖", cx, 175);
        ctx.restore();

        // --- rótulo pequeno acima ---
        ctx.save();
        ctx.font = "bold 13px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "center";
        ctx.fillText("✦  MISSÃO FRACASSADA  ✦", cx, 128);
        ctx.restore();

        // --- GAME OVER principal ---
        ctx.save();
        ctx.font = "bold 58px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.shadowColor = "#ff2b2b";
        ctx.shadowBlur = 40;
        ctx.textAlign = "center";
        ctx.fillText("GAME", cx, 210);
        ctx.restore();

        ctx.save();
        ctx.font = "bold 58px Arial";
        ctx.fillStyle = "#ff2b2b";
        ctx.shadowColor = "#ff2b2b";
        ctx.shadowBlur = 40;
        ctx.textAlign = "center";
        ctx.fillText("OVER", cx, 270);
        ctx.restore();

        // --- linha separadora ---
        ctx.save();
        ctx.strokeStyle = "#ff2b2b";
        ctx.globalAlpha = 0.2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(60, 300);
        ctx.lineTo(LARGURA - 60, 300);
        ctx.stroke();
        ctx.restore();

        // --- card de estatísticas ---
        ctx.save();
        ctx.fillStyle = "rgba(255,43,43,0.07)";
        ctx.strokeStyle = "rgba(255,43,43,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        desenharRetArredondado(ctx, 60, 318, LARGURA - 120, 130, 10);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "13px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.45;
        ctx.textAlign = "center";
        ctx.fillText("PONTUAÇÃO FINAL", cx, 348);
        ctx.restore();

        ctx.save();
        ctx.font = "bold 44px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 18;
        ctx.textAlign = "center";
        ctx.fillText(pontuacao, cx, 396);
        ctx.restore();

        ctx.save();
        ctx.font = "13px Arial";
        ctx.fillStyle = "#00bfff";
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "center";
        ctx.fillText(`fase ${fase}  •  $${dinheiro} transferidos ao menu`, cx, 424);
        ctx.restore();

        // --- linha separadora ---
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.globalAlpha = 0.1;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(60, 468);
        ctx.lineTo(LARGURA - 60, 468);
        ctx.stroke();
        ctx.restore();

        // --- botão ---
        const btnW = 240, btnH = 48;
        const btnX = cx - btnW / 2;

        ctx.save();
        ctx.fillStyle = "rgba(255,230,0,0.1)";
        ctx.strokeStyle = "rgba(255,230,0,0.5)";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        desenharRetArredondado(ctx, btnX, 484, btnW, btnH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "bold 20px Arial";
        ctx.fillStyle = "#ffe600";
        ctx.shadowColor = "#ffe600";
        ctx.shadowBlur = 18;
        ctx.textAlign = "center";
        ctx.fillText(TRANS_SAIDA.ativo ? "voltando ao menu..." : "SHIFT  —  VOLTAR AO MENU", cx, 514);
        ctx.restore();

        // --- linha rodapé ---
        ctx.save();
        ctx.strokeStyle = "#ff2b2b";
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(40, 556);
        ctx.lineTo(LARGURA - 40, 556);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = "12px Arial";
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.22;
        ctx.textAlign = "center";
        ctx.fillText("seu dinheiro foi guardado — gaste na loja do menu", cx, 580);
        ctx.restore();

        // --- transição de saída (gameover → menu) ---
        desenharTransicaoSaida();

        // mensagem de instrução pulsante sobre o botão quando transição inativa
        if(!TRANS_SAIDA.ativo){
            const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 500);
            ctx.save();
            ctx.globalAlpha = pulse * 0.55;
            ctx.font = "13px Arial";
            ctx.fillStyle = "#ffe600";
            ctx.textAlign = "center";
            ctx.fillText("Pressione SHIFT para voltar ao menu", cx, 472);
            ctx.restore();
        }
    }

    // JOGO
    else if(estado === JOGO){

        // durante transição de morte ou após boss destruído: para controles
        const emTransicao = TRANS_MORTE.ativo || bossDestruido;

        if(!emTransicao) nave.mover();
        nave.update();
        nave.desenhar();

        // TIROS
        tiros.forEach((tiro,index)=>{

            if(!emTransicao) tiro.mover();
            tiro.desenhar();

            if(tiro.y < -20){

                tiros.splice(index,1);
            }
        });

        // ASTEROIDES
        asteroides.forEach((ast)=>{

            if(!emTransicao) ast.mover();
            ast.desenhar();

            // NAVE (ignora colisão durante transição de morte)
            if(!emTransicao && colisao({

                x:nave.x,
                y:nave.y,
                tamanho:nave.tamanho

            },ast)){

                if(nave.escudoTimer <= 0){

                    nave.vida--;

                    Audio.somDano();

                    explosoes.push(
                        new Explosao(
                            nave.x+35,
                            nave.y+35
                        )
                    );

                    if(nave.vida <= 0){

                        Audio.somMorte();
                        iniciarTransicaoMorte();
                    }

                } else {

                    // escudo absorve o golpe
                    Audio.somExplosao(false);
                    explosoes.push(new Explosao(ast.x + ast.tamanho/2, ast.y + ast.tamanho/2));
                }

                ast.resetar();
            }

            // TIRO
            tiros.forEach((tiro,index)=>{

                if(

                    tiro.x < ast.x + ast.tamanho &&
                    tiro.x + tiro.largura > ast.x &&
                    tiro.y < ast.y + ast.tamanho &&
                    tiro.y + tiro.altura > ast.y
                ){

                    tiros.splice(index,1);

                    pontuacao += 10;

                    dinheiro += 5;

                    stats.asteroidesDestruidos++;

                    Audio.somExplosao(false);

                    explosoes.push(

                        new Explosao(
                            ast.x + ast.tamanho/2,
                            ast.y + ast.tamanho/2
                        )
                    );

                    for(let i=0;i<12;i++){

                        particulas.push(

                            new Particula(
                                ast.x + ast.tamanho/2,
                                ast.y + ast.tamanho/2
                            )
                        );
                    }

                    ast.resetar();
                }
            });
        });

        // EXPLOSÕES
        explosoes.forEach((exp,index)=>{

            exp.update();
            exp.desenhar();

            if(exp.alpha <= 0){

                explosoes.splice(index,1);
            }
        });

        // PARTÍCULAS
        particulas.forEach((p,index)=>{

            p.update();
            p.desenhar();

            if(p.alpha <= 0){

                particulas.splice(index,1);
            }
        });

        // BOSS: atualiza e desenha
        if(bossAtivo || bossDestruido){
            atualizarBoss();
            desenharBoss();
        }

        // FASES
        if(!bossAtivo && !bossDestruido && pontuacao >= fase*200){

            fase++;
            stats.fasesCompletas = fase - 1;
            Audio.somNovaFase();

            if(fase >= FASE_BOSS){
                // ativa o boss final — sem mais asteroides normais
                ativarBoss();
            } else {
                asteroides.push(new Asteroide());
            }
        }

        // atmosfera de tensão quando boss está ativo (vinheta vermelha pulsante)
        if(bossAtivo){
            const pulso = 0.08 + 0.05 * Math.sin(Date.now() / 300);
            ctx.save();
            const vigBoss = ctx.createRadialGradient(
                LARGURA/2, ALTURA/2, ALTURA*0.3,
                LARGURA/2, ALTURA/2, ALTURA*0.85
            );
            vigBoss.addColorStop(0, "rgba(255,0,0,0)");
            vigBoss.addColorStop(1, `rgba(160,0,0,${pulso})`);
            ctx.fillStyle = vigBoss;
            ctx.fillRect(0, 0, LARGURA, ALTURA);
            ctx.restore();

            // alerta "FASE FINAL" no topo
            if(!boss.entrou){
                const a = boss.alertaAlpha * (0.7 + 0.3 * Math.sin(Date.now() / 100));
                ctx.save();
                ctx.globalAlpha = a;
                ctx.font = "bold 16px Arial";
                ctx.fillStyle = "#ff2b2b";
                ctx.shadowColor = "#ff0000";
                ctx.shadowBlur = 25;
                ctx.textAlign = "center";
                ctx.fillText("☄  ASTEROIDE COLOSSAL SE APROXIMA  ☄", LARGURA/2, 30);
                ctx.restore();
            }
        }

        // HUD
        desenharVida();

        // HUD buffs usáveis
        const buffsHud = [
            { label:"Q", nome:"Escudo", qtd: nave.buffEscudo, timer: nave.escudoTimer, maxTimer: 300, cor:"#00ffff" },
            { label:"E", nome:"Bomba",  qtd: nave.buffBomba,  timer: 0,               maxTimer: 0,   cor:"#ff4400" },
            { label:"R", nome:"Turbo",  qtd: nave.buffTurbo,  timer: nave.turboTimer,  maxTimer: 240, cor:"#ffe600" },
        ];

        buffsHud.forEach((b, i) => {
            const bx = LARGURA - 110;
            const by = 15 + i * 40;
            const bw = 95, bh = 32;

            // fundo
            ctx.save();
            ctx.fillStyle = b.timer > 0 ? `rgba(${hexToRgb(b.cor)},0.18)` : "rgba(255,255,255,0.04)";
            ctx.strokeStyle = b.timer > 0 ? b.cor : b.qtd > 0 ? b.cor + "55" : "rgba(255,255,255,0.1)";
            ctx.lineWidth = b.timer > 0 ? 1.5 : 1;
            ctx.beginPath();
            desenharRetArredondado(ctx, bx, by, bw, bh, 6);
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // barra de duração ativa
            if(b.timer > 0 && b.maxTimer > 0){
                const prog = b.timer / b.maxTimer;
                ctx.save();
                ctx.fillStyle = b.cor;
                ctx.globalAlpha = 0.25;
                ctx.beginPath();
                desenharRetArredondado(ctx, bx, by, bw * prog, bh, 6);
                ctx.fill();
                ctx.restore();
            }

            // tecla
            ctx.save();
            ctx.font = "bold 12px Arial";
            ctx.fillStyle = b.timer > 0 ? b.cor : b.qtd > 0 ? b.cor : "#555";
            ctx.shadowColor = b.cor;
            ctx.shadowBlur = b.timer > 0 ? 10 : 0;
            ctx.textAlign = "left";
            ctx.fillText(`[${b.label}]`, bx + 6, by + 13);
            ctx.restore();

            // nome
            ctx.save();
            ctx.font = "bold 11px Arial";
            ctx.fillStyle = b.timer > 0 ? "#fff" : b.qtd > 0 ? "#ccc" : "#444";
            ctx.textAlign = "left";
            ctx.fillText(b.nome, bx + 6, by + 26);
            ctx.restore();

            // estoque ou ATIVO
            ctx.save();
            ctx.font = "bold 13px Arial";
            ctx.fillStyle = b.timer > 0 ? b.cor : b.qtd > 0 ? "#fff" : "#333";
            ctx.shadowColor = b.cor;
            ctx.shadowBlur = b.timer > 0 ? 12 : 0;
            ctx.textAlign = "right";
            ctx.fillText(b.timer > 0 ? "ATIVO" : `x${b.qtd}`, bx + bw - 6, by + 20);
            ctx.restore();
        });

        textoGlow(
            `Pontos: ${pontuacao}`,
            15,
            60,
            22,
            "#ffffff"
        );

        textoGlow(
            `Dinheiro: $${dinheiro}`,
            15,
            90,
            22,
            "#00ff99"
        );

        textoGlow(
            `Fase: ${fase}`,
            15,
            120,
            22,
            "#00bfff"
        );

        // Transição cinematográfica de morte (overlay sobre o jogo)
        if(TRANS_MORTE.ativo){
            atualizarTransicaoMorte();
            desenharTransicaoMorte();
        }
    }

    // CUTSCENE FINAL
    else if(estado === CUTSCENE){
        atualizarCutscene();
        desenharCutscene();
    }

    // CRÉDITOS
    else if(estado === CREDITOS){
        desenharCreditos();
    }

    // fecha o translate do camera shake
    if (shakeX !== 0 || shakeY !== 0) ctx.restore();

    requestAnimationFrame(loop);
}

loop();