"""Synthesizes the ELYSION film score: an original ambient piece timed to the shot list.

    python3 tools/film/score.py tools/film/elysion.json out.wav

Everything is generated here (no samples): string-like pads from detuned additive saws, a sub drone,
glass bells, a soft city pulse, a low brass swell for the undercity and engines, and a final rise
into a deep hit under the title. A synthetic hall reverb glues it together.
D minor, opening on Dm(add9), lifting to Bbmaj7(#11) for the spire, resolving to D major at the end.
"""
import json
import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
film = json.load(open(sys.argv[1]))
out_path = sys.argv[2]
cuts = [0.0]
for s in film["shots"]:
    cuts.append(cuts[-1] + s["dur"])
DUR = cuts[-1]
TOTAL = DUR + 3.0
N = int(TOTAL * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
shot_start = {s["name"]: cuts[i] for i, s in enumerate(film["shots"])}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def note(name):
    names = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
    p, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + names[p]


def env(t0, t1, att, rel, shape=1.0):
    """Attack/sustain/release envelope over [t0, t1] (release extends past t1)."""
    e = np.zeros(N)
    a = np.clip((t - t0) / max(att, 1e-3), 0, 1)
    r = np.clip(1 - (t - t1) / max(rel, 1e-3), 0, 1)
    e = np.minimum(a, r) * (t >= t0)
    return e ** shape


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def pad_voice(m, t0, t1, att=2.5, rel=3.5, bright=2400, amp=0.05, pan=0.0):
    """A string-section-like voice: three detuned additive saws, lowpassed, slow vibrato."""
    f = hz(m)
    L = np.zeros(N); R = np.zeros(N)
    e = env(t0, t1, att, rel, 1.4)
    idx = e > 0
    tt = t[idx]
    for k, det in enumerate((-0.07, 0.0, 0.08)):
        ff = f * 2 ** (det / 12)
        vib = 1 + 0.0025 * np.sin(2 * np.pi * (4.6 + 0.4 * k) * tt + k)
        ph = 2 * np.pi * np.cumsum(np.full(tt.size, ff) * vib) / SR + rng.uniform(0, 6.28)
        y = np.zeros(tt.size)
        nh = int(min(24, 7000 // ff))
        for n in range(1, nh + 1):
            y += np.sin(n * ph) / n
        w = 0.5 + 0.5 * np.sin(np.pi * (pan + (k - 1) * 0.3) * 0.5 + np.pi / 4)
        L[idx] += y * (1 - w) * 1.4; R[idx] += y * w * 1.4
    L = lowpass(L, bright); R = lowpass(R, bright)
    return L * e * amp, R * e * amp


mixL = np.zeros(N); mixR = np.zeros(N)
def add(lr, g=1.0):
    global mixL, mixR
    mixL += lr[0] * g; mixR += lr[1] * g


# ------------------------------------------------------------------ harmony (pads)
S = shot_start
sections = [
    # (start, end, notes, brightness, amp)
    (0.0, S["spire"] + 0.5, ["D3", "A3", "F4", "E5"], 1500, 0.045),
    (S["spire"], S["skyline"] + 0.5, ["Bb2", "F3", "D4", "A4", "E5"], 2600, 0.05),
    (S["skyline"], S["canal"] + 0.5, ["F2", "C4", "G4", "A4", "E5"], 3000, 0.048),
    (S["canal"], S["undercity"] + 0.5, ["G2", "D4", "F4", "Bb4", "A5"], 2200, 0.045),
    (S["undercity"], S["engines"] + 0.5, ["Bb1", "F3", "Bb3", "D4", "F4"], 1300, 0.055),
    (S["engines"], S["finale"] + 0.5, ["C2", "G3", "C4", "E4", "G4"], 1800, 0.058),
    (S["finale"], DUR + 1.0, ["D2", "A3", "D4", "F#4", "A4", "E5"], 3200, 0.062),
]
for (a, b, notes, br, amp) in sections:
    for i, nm in enumerate(notes):
        add(pad_voice(note(nm), a, b, att=2.8, rel=3.8, bright=br, amp=amp, pan=(i / max(1, len(notes) - 1)) * 2 - 1))

# ------------------------------------------------------------------ sub drone (D), swelling with the sections
sub = (np.sin(2 * np.pi * hz(note("D1")) * t) * 0.6 + np.sin(2 * np.pi * hz(note("D2")) * t) * 0.3)
sub_env = env(0.3, DUR + 0.5, 5.0, 4.0) * (0.75 + 0.25 * np.sin(2 * np.pi * t / 9.0))
under = env(S["undercity"], S["finale"], 2.0, 3.0)
sub_env *= 1 + 0.8 * under
add((sub * sub_env * 0.11, sub * sub_env * 0.11))

# ------------------------------------------------------------------ glass bells (spire, crown, lake, finale)
def bell(t0, m, amp, pan):
    f = hz(m)
    i0 = int(t0 * SR)
    L = int(4.5 * SR)
    if i0 >= N:
        return
    L = min(L, N - i0)
    tt = np.arange(L) / SR
    y = np.zeros(L)
    for ratio, g, dec in ((1.0, 1.0, 2.6), (2.76, 0.45, 1.4), (5.4, 0.22, 0.7), (8.93, 0.1, 0.35)):
        y += g * np.sin(2 * np.pi * f * ratio * tt) * np.exp(-tt / dec)
    y *= np.minimum(1, tt / 0.004) * amp
    w = 0.5 + 0.5 * pan
    mixL[i0:i0 + L] += y * (1 - w); mixR[i0:i0 + L] += y * w

def arpeggio(t0, t1, notes, step, amp):
    k = 0
    x = t0
    while x < t1:
        bell(x + rng.uniform(-0.02, 0.02), note(notes[k % len(notes)]), amp * rng.uniform(0.7, 1.0), rng.uniform(-0.8, 0.8))
        x += step
        k += 1 if rng.random() > 0.15 else 2

arpeggio(S["spire"] + 0.8, S["skyline"], ["D5", "F5", "A5", "E6", "A5", "F5"], 0.5, 0.028)
arpeggio(S["lake"] + 0.3, S["undercity"], ["G5", "Bb5", "D6", "A5"], 0.62, 0.022)
arpeggio(S["finale"] + 3.0, DUR - 0.5, ["D5", "F#5", "A5", "E6", "A5", "F#5"], 0.42, 0.03)

# ------------------------------------------------------------------ city pulse (skyline, street): soft plucks at 96 bpm
def pluck(t0, m, amp, pan):
    f = hz(m)
    i0 = int(t0 * SR)
    L = min(int(0.9 * SR), N - i0)
    if L <= 0:
        return
    tt = np.arange(L) / SR
    y = np.zeros(L)
    for n in range(1, 9):
        y += np.sin(2 * np.pi * f * n * tt) / n * np.exp(-tt * (3 + n * 2.2))
    y *= np.minimum(1, tt / 0.003) * amp
    w = 0.5 + 0.5 * pan
    mixL[i0:i0 + L] += y * (1 - w); mixR[i0:i0 + L] += y * w

beat = 60 / 96 / 2
x = S["skyline"] + 0.4
pattern = ["A3", "C4", "F4", "C4", "G3", "C4", "E4", "C4"]
k = 0
while x < S["canal"] - 0.3:
    ramp = min(1, (x - S["skyline"]) / 2.5) * min(1, (S["canal"] - x) / 1.5)
    pluck(x, note(pattern[k % len(pattern)]), 0.05 * ramp * (1.15 if k % 4 == 0 else 0.85), -0.35 if k % 2 else 0.35)
    x += beat
    k += 1

# ------------------------------------------------------------------ low brass swell (undercity, engines)
def brass(m, t0, t1, amp):
    f = hz(m)
    e = env(t0, t1, 2.2, 2.5, 1.6)
    idx = e > 0
    tt = t[idx]
    ph = 2 * np.pi * f * tt
    y = np.zeros(tt.size)
    for n in range(1, 16):
        y += np.sin(n * ph + 0.3 * n) * (1 / n) ** 0.8
    out = np.zeros(N); out[idx] = y
    out = lowpass(out, 900) * e * amp
    return out, out

add(brass(note("Bb1"), S["undercity"] + 1.0, S["engines"] + 0.2, 0.05))
add(brass(note("F2"), S["undercity"] + 2.5, S["engines"] + 0.2, 0.035))
add(brass(note("C2"), S["engines"], S["finale"] + 0.5, 0.06))
add(brass(note("G2"), S["engines"] + 1.0, S["finale"] + 0.5, 0.04))

# ------------------------------------------------------------------ rise and hit under the title
title_t = S["finale"] + 2.5
noise = rng.standard_normal(N)
rise = highpass(lowpass(noise, 9000), 1800) * np.clip((t - (title_t - 4.0)) / 4.0, 0, 1) ** 3 * (t < title_t) * 0.05
add((rise, np.roll(rise, 37)))
i0 = int(title_t * SR)
L = min(int(6 * SR), N - i0)
tt = np.arange(L) / SR
sweep = np.sin(2 * np.pi * np.cumsum(32 + 60 * np.exp(-tt * 6)) / SR) * np.exp(-tt / 1.8) * 0.5
burst = lowpass(rng.standard_normal(L), 700) * np.exp(-tt / 0.5) * 0.12
hit = (sweep + burst) * np.minimum(1, tt / 0.002)
mixL[i0:i0 + L] += hit; mixR[i0:i0 + L] += hit

# soft swells at each cut, so the cuts breathe with the music
for c in cuts[1:-1]:
    sw = highpass(lowpass(noise, 4000), 400) * np.exp(-((t - c + 0.4) / 0.45) ** 2) * 0.012
    add((sw, np.roll(sw, 53)))

# ------------------------------------------------------------------ hall reverb and master
IRL = int(4.2 * SR)
ti = np.arange(IRL) / SR
irL = rng.standard_normal(IRL) * np.exp(-ti / 1.15); irR = rng.standard_normal(IRL) * np.exp(-ti / 1.2)
irL = lowpass(irL, 5200); irR = lowpass(irR, 5000)
irL[: int(0.012 * SR)] = 0; irR[: int(0.017 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2)); irR /= np.sqrt(np.sum(irR ** 2))
wetL = fftconvolve(mixL, irL)[:N]; wetR = fftconvolve(mixR, irR)[:N]
L = mixL * 0.62 + wetL * 0.55
R = mixR * 0.62 + wetR * 0.55
fade = np.clip(t / 1.2, 0, 1) * np.clip((TOTAL - t) / 2.5, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(L / peak * 1.25) / np.tanh(1.25) * 0.89
R = np.tanh(R / peak * 1.25) / np.tanh(1.25) * 0.89
pcm = (np.stack([L, R], 1) * 32767).astype(np.int16)

import wave
with wave.open(out_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"score: {TOTAL:.1f} s, {out_path}")
