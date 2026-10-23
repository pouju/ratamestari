# Competition: classes, formats and winning times

Digest of what the course spec needs: which classes exist, what long and middle distance mean, and the winning time a course is set for. Sources (see [`docs/sources`](../sources/README.md)): **LS** = Suunnistuksen lajisäännöt 2026, **IOF** = IOF Competition Rules 2026, **RMK** = Ratamestarikirja. Lines marked **Interpretation** are our own reading.

## Classes

- Classes by sex and age: H (men) and D (women) 10, 12, 14, 16, 18, 20, 21, 35, then every five years up to 75 at national events; older classes may be held (LS 9.15, 9.151).
- Junior classes are H/D20 and younger, veteran classes H/D35 and older (LS 9.14).
- A class may be split by skill level with letters A (most demanding), B and C, e.g. H21A, H21B (LS 9.21). An elite class E may be held in H/D21, 20 and 18 (LS 9.22).
- "A" is relative to the class: H80A, H12A, H21A and D35A are very different (RMK 1.3.3).

## Formats

- **Long distance:** varied orienteering problems solved with several techniques (LS 8.31). Long route-choice legs are desirable, essential at championships (RMK 2.S.1).
- **Middle distance:** continuous concentration and quick reading of the terrain, with varied problems (LS 8.33). Legs are short on average (RMK 2.S.2).
- **Ultralong:** route choice is the main demand, with several long legs (LS 8.34).

## Winning times

The winning time is the ideal time of the class winner (LS 11.25). A course is set for the middle of the interval (IOF 16.9). **Interpretation:** we follow IOF 16.9 for SSL events too.

### National events, main classes (LS 11.25), minutes

| Class    | Middle | Long  |
| -------- | ------ | ----- |
| H/D10    | 14–16  | 16–20 |
| H/D12    | 15–20  | 20–25 |
| H/D13    | 15–20  | 25–30 |
| H/D14    | 15–20  | 30–35 |
| H/D15    | 20–25  | 35–40 |
| H/D16    | 20–25  | 40–45 |
| H/D18    | 25–30  | 50–55 |
| H/D20    | 25–30  | 55–60 |
| H/D21    | 30–35  | 65–75 |
| H/D35    | 30–35  | 60–65 |
| H/D40    | 30–35  | 55–60 |
| H/D45    | 30–35  | 50–55 |
| H/D50    | 25–30  | 50–55 |
| H/D55    | 25–30  | 45–50 |
| H/D60    | 25–30  | 45–50 |
| H/D65    | 25–30  | 45–50 |
| H/D70–90 | 25–30  | 40–45 |

- Lower classes (B, C) have 50–100% of the main class winning time (LS 11.251).
- Night: 90% of long distance (LS 11.252). Ultralong: at most twice the long distance (LS 11.26).
- Except for middle distance, winning times may be set lower than these (LS 11.27).

### Finnish championships (SM), finals (LS 19.41, 19.44), minutes

| Class    | Middle | Long  |
| -------- | ------ | ----- |
| H/D15    | 20–25  | 40–50 |
| H/D16    | 20–25  | 45–55 |
| H/D18    | 25–30  | 55–65 |
| H/D20    | 25–30  | 65–75 |
| H/D21    | 30–35  | 85–95 |
| H/D35    | 30–35  | 65–75 |
| H/D40    | 30–35  | 60–70 |
| H/D45    | 30–35  | 55–65 |
| H/D50    | 25–30  | 50–60 |
| H/D55    | 25–30  | 50–60 |
| H/D60    | 25–30  | 45–55 |
| H/D65    | 25–30  | 45–55 |
| H/D70–90 | 25–30  | 40–50 |

- Qualification races have their own, shorter winning times (LS 19.41, 19.44). Not used yet.
- SM night: 80% of long distance (LS 19.42). SM ultralong: 180% of long distance (LS 19.43).

## Skill level of a course

- SSL colour levels by class (RMK 11): 10 white, 12–13 yellow, 14 orange, 15 red, 16 purple, 18 blue, 20–21 black.
- **Interpretation:** veteran A classes are technically at the blue level and physically easier, following RMK 1.3.3 ("H80A is A level, but not the same as H21A").
- **Interpretation:** a B class is two colour steps easier than its A class and a C class is yellow, since C "should be manageable for a beginner who needs leading features" (RMK 1.3.3). B and C winning times are 75% of the A class, the middle of LS 11.251.
- **Interpretation:** control site difficulty (1–5, see the ISOM digest) by colour: white 1, yellow 1–2, orange and red 2–3, purple 3–4, blue and black 3–5.

## Course length and time

- Course length is measured on the map along the shortest route a competitor can take, without regard to climb (LS 11.22). Compulsory marked routes and crossings are included (LS 11.23, 11.24).
- **Interpretation:** the course search aims at the winning time, not at a length. The engine estimates the winner's time along the fastest route of every leg from the terrain (runnability classes, barriers), so a slow map gives a shorter course and a fast map a longer one.
- **Interpretation:** the winner's pace at 100% runnability defaults to the ISOM §2.3 example of 4:00 min/km and can be changed per course. Navigation time is not modelled separately; it is part of this pace. Calibrating it against a known course and winning time in similar terrain is better than the default.
- The reported course length still follows LS 11.22: the shortest passable route, not the fastest.
