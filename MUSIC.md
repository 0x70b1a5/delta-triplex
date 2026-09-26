# Procedural music notes

Research notes for procgen music, starting from the Euterpea (Haskell) examples.

## The Euterpea "random infinite music" example

The tutorial example is **"Generating music with random numbers"** (`RandomMusic.lhs`, Donya Quick, Euterpea2-Examples). It does *not* keep harmony: every note is independently random.

```haskell
randInts :: Int -> [Int]
randInts seed = recInts (mkStdGen seed) where
    recInts g = let (i,g') = next g in i : recInts g'

melGen s =
    let pitches = map pitch $ randIntsRange (30,80) s   -- any semitone across ~4 octaves
        vols    = randIntsRange (40,100) (s+1)
    in  line $ map (note sn) $ zip pitches vols

infinitePlay = play $ melGen 42
```

- **Infinite:** `randInts` is a lazy, endless stream from a seeded generator, and `play` consumes it as it goes. The seed makes it reproducible, and `seed+1` gives the volumes their own stream.
- **Why it sounds less chaotic than it is:** very fast sixteenth notes blur into texture. `somethingWeird` layers three voices at drifting tempos (accelerando and ritardando) for phase-shifting texture, not harmony.

## Keeping harmony: the infinite jazz generator

Donya Quick's "An Infinite Jazz Music Generator" is the one that actually keeps harmony. It works in two layers: generate the harmony first, then fit every note to it.

1. **Random chord progression as Roman numerals:** `chordProg = map (allRNums !!) $ randomRs (0, length allRNums - 1) gR`. Random degrees I–VII are safe because every diatonic chord belongs to the same key.
2. **Each chord maps to a mode**, a rotation of C major `[0,2,4,5,7,9,11]` (ii → D dorian, V → G mixolydian, …). This is **chord-scale theory**: each moment has a legal pitch set, so notes drawn from it can't clash.
3. **Voices constrained by the current mode:**
   - **Chords** (deterministic): root, 3rd, 5th and 7th of the mode, fitted into MIDI 60–71.
   - **Bass:** the chord root on each downbeat, with the octave picked by a stochastic path through the bass range to avoid leaps. It fills three notes per measure from the mode: 70% unaltered, and 10% each for a chromatic approach from above, a chromatic approach from below, or a repeat of the next pitch. `probChromatic = 0.2`. Chromatic notes are fine because they resolve right away into a chord tone.
4. **Independent random streams** (`infSplit`): each part gets its own generator, so changing one part doesn't reshuffle the others.

**Theory:** consonance comes from shared pitch-class sets. Random choices *within* a set that changes slowly sound intentional, while random choices *across* all 12 semitones sound atonal. A slow harmonic rhythm (one chord per measure) gives the ear something stable to measure the fast random notes against.

## Structure through transformation: "Interesting Music in Four Lines of Code"

```haskell
x1 = c 4 en :+: g 4 en :+: c 5 en :+: g 5 en
x2 = x1 :+: transpose 3 x1
x3 = x2 :+: x2 :+: invert x2 :+: retro x2
x4 = forever x3 :=: forever (tempo (2/3) x3)
```

This one isn't random. Fifths-based motifs survive inversion without turning atonal, and the 2/3-tempo layer slides in and out of phase with the original. The loop repeats every 12 measures, but you can barely hear it.

## Next step up: *The Haskell School of Music*, ch. 14

"Random Numbers, Probability Distributions, and Markov Chains" (Hudak & Quick). This summary is from memory, not verified, because the chapter is paywalled.

- **Random walks:** each pitch is a small step from the previous one, which gives melodic continuity.
- **Markov chains trained on existing melodies:** these pick up the key implicitly from the transition statistics.

## Sketch for Delta Triplex

1. Generate a slow random walk over chord degrees, or a Markov chain over progressions we like.
2. Get the scale or chord-tone set from the current chord.
3. Pick melody notes by random walk inside that set, favoring chord tones on strong beats.
4. Optionally tie harmonic tension to puzzle progress, and resolve to the tonic on a win.

## Sources

- [RandomMusic.lhs (Euterpea2-Examples)](https://github.com/Euterpea/Euterpea2-Examples/blob/master/NoteLevel/RandomMusic.lhs)
- [An Infinite Jazz Music Generator – Donya Quick](https://www.donyaquick.com/an-infinite-jazz-music-generator/)
- [Interesting Music in Four Lines of Code – Donya Quick](https://www.donyaquick.com/interesting-music-in-four-lines-of-code/)
- [HSoM ch. 14 (Cambridge)](https://www.cambridge.org/core/books/abs/haskell-school-of-music/random-numbers-probability-distributions-and-markov-chains/E8BA531DFF913218098D8969F700A439)
- [Euterpea video tutorials](https://www.euterpea.com/tutorials-and-talks.html)
