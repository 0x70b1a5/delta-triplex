#!/usr/bin/env python3
"""Author, verify and pack the curated daily puzzles; stdlib only.

Designs live in dailies/*.txt. Each puzzle is a header line and an ASCII
triangle drawn as the player first sees it on desktop (point down):

    2026-09-01 Mouse                 date, then the name (shown to players)
    #######                          the base row: 2n-1 triangles
     #.#.#                           each line is indented one more and two
      ###                            shorter; '#' is filled, '.' is empty
       .

Columns line up across rows, so each character shares its flat edge with the
character directly above or below it. An optional `orientation: 1` line (after
the header) turns the opening view 120 degrees clockwise per step.

    python3 dailies.py check [files...]    verify line-solvability, render PNGs
    python3 dailies.py build               write dailies.json for the server
    python3 dailies.py show 'CODE'         print a packed code as ASCII art
"""
import base64, json, math, re, struct, sys, zlib
from pathlib import Path

ROOT = Path(__file__).parent
DESIGNS = ROOT / "dailies"
OUT = ROOT / "dailies.json"
PREVIEW = ROOT / "preview"


def canonical(r, p):
    """Canonical id of the p-th triangle (left to right) in row r (tip is row 0)."""
    return r * r + 2 * r - p


def parse(text, source="?"):
    puzzles, block = [], None
    for number, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith(";"):
            continue
        header = re.fullmatch(r"(\d{4}-\d{2}-\d{2})\s+(.+)", line)
        if header:
            block = {"date": header[1], "name": header[2].strip(), "rows": [], "orientation": 0, "where": f"{source}:{number}"}
            puzzles.append(block)
        elif block is None:
            raise ValueError(f"{source}:{number}: art before the first date header")
        elif m := re.fullmatch(r"\s*orientation:\s*([012])", line):
            block["orientation"] = int(m[1])
        else:
            block["rows"].append(line)
    for puzzle in puzzles:
        puzzle["size"], puzzle["solution"] = grid(puzzle["rows"], puzzle["where"])
    return puzzles


def grid(rows, where):
    n = len(rows)
    if not 2 <= n <= 10:
        raise ValueError(f"{where}: {n} rows; sizes 2-10 are supported")
    solution = [0] * (n * n)
    for k, line in enumerate(rows):
        r = n - 1 - k
        if line[:k].strip() or len(line) != k + 2 * r + 1 or set(line[k:]) - set("#."):
            raise ValueError(f"{where}: line {k + 1} must be {k} spaces then {2 * r + 1} of '#' or '.': {line!r}")
        for p, char in enumerate(line[k:]):
            solution[canonical(r, p)] = int(char == "#")
    return n, solution


def ascii_art(n, solution):
    return "\n".join(" " * k + "".join("#" if solution[canonical(n - 1 - k, p)] else "." for p in range(2 * (n - 1 - k) + 1))
                     for k in range(n))


# Lines: for each axis, the ranks of cells. Cell (i, j, o) with r = i + j + o;
# the three axes are i, j and n-1-i-j-o, matching the engine.
def cells(n):
    out = []
    for r in range(n):
        for i in range(r, -1, -1):
            for o in (1, 0):
                j = r - i - o
                if j >= 0 and not (o == 1 and i == r):
                    out.append((i, j, o))
    out.sort(key=lambda c: (c[0] + c[1] + c[2]) ** 2 + 2 * c[0] + c[2])
    assert [r * r + 2 * i + o for i, j, o in out for r in [i + j + o]] == list(range(n * n))
    return out


def centroid(n, cell):
    i, j, o = cell
    vertex = lambda a, b: ((b - a) / n, (2 / 3 - (a + b) / n) * math.sqrt(3))
    corners = [vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1)] if o else [vertex(i, j), vertex(i, j + 1), vertex(i + 1, j)]
    return sum(c[0] for c in corners) / 3, sum(c[1] for c in corners) / 3


def lines(n):
    """Cells of each strip, ordered along the strip (the engine's rotate.js geometry)."""
    cs = cells(n)
    directions = [(1, -math.sqrt(3)), (-1, -math.sqrt(3)), (1, 0)]
    result = []
    for axis in range(3):
        dx, dy = directions[axis]
        for rank in range(n):
            members = [t for t, (i, j, o) in enumerate(cs) if (i, j, n - 1 - i - j - o)[axis] == rank]
            members.sort(key=lambda t: centroid(n, cs[t])[0] * dx + centroid(n, cs[t])[1] * dy)
            result.append(members)
    return result


def runs(bits):
    out, count = [], 0
    for b in bits:
        if b:
            count += 1
        elif count:
            out.append(count); count = 0
    if count:
        out.append(count)
    return out


def placements(length, clue):
    """Every 0/1 tuple of the given length whose runs equal clue."""
    if not clue:
        return [(0,) * length]
    head, rest = clue[0], clue[1:]
    tail_min = sum(rest) + len(rest)
    out = []
    for start in range(length - tail_min - head + 1):
        prefix = (0,) * start + (1,) * head
        if rest:
            for tail in placements(length - len(prefix) - 1, rest):
                out.append(prefix + (0,) + tail)
        else:
            out.append(prefix + (0,) * (length - len(prefix)))
    return out


def deduce(n, solution):
    """Parallel line deduction like the engine's generator. Returns (solved, rounds, first_round_known)."""
    ls = lines(n)
    options = [placements(len(line), runs([solution[t] for t in line])) for line in ls]
    known = [-1] * (n * n)
    rounds = initial = 0
    while True:
        rounds += 1
        nxt = known[:]
        for line, opts in zip(ls, options):
            opts[:] = [o for o in opts if all(known[t] < 0 or known[t] == v for t, v in zip(line, o))]
            if not opts:
                raise ValueError("contradiction: clues do not match any board")
            for p, t in enumerate(line):
                values = {o[p] for o in opts}
                if len(values) == 1:
                    nxt[t] = values.pop()
        changed = nxt != known
        known = nxt
        if rounds == 1:
            initial = sum(v >= 0 for v in known)
        if all(v >= 0 for v in known):
            return True, rounds, initial
        if not changed:
            return False, rounds, initial


def undetermined(n, solution):
    """Cells line logic cannot settle, for fixing designs."""
    ls = lines(n)
    options = [placements(len(line), runs([solution[t] for t in line])) for line in ls]
    known = [-1] * (n * n)
    while True:
        before = known[:]
        for line, opts in zip(ls, options):
            opts[:] = [o for o in opts if all(known[t] < 0 or known[t] == v for t, v in zip(line, o))]
            for p, t in enumerate(line):
                values = {o[p] for o in opts}
                if len(values) == 1:
                    known[t] = values.pop()
        if known == before:
            return [t for t, v in enumerate(known) if v < 0]


def encode(n, solution, orientation=0):
    """Same bytes as TriShare.encode: version 3, size | orientation << 4, MSB-first bits."""
    data = bytearray(2 + math.ceil(n * n / 8))
    data[0], data[1] = 3, n | orientation << 4
    for i, v in enumerate(solution):
        data[2 + (i >> 3)] |= v << (7 - (i & 7))
    return base64.urlsafe_b64encode(bytes(data)).decode().rstrip("=")


def decode(code):
    data = base64.urlsafe_b64decode(code + "=" * (-len(code) % 4))
    n, orientation = data[1] & 15, data[1] >> 4
    return n, [(data[2 + (i >> 3)] >> (7 - (i & 7))) & 1 for i in range(n * n)], orientation


def png(n, solution, path, marks=(), width=360):
    """Rasterize the point-down board. Filled = dark, empty = light, marks = red."""
    height = int(width * math.sqrt(3) / 2)
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            # Continuous lattice coordinates: base at the top, tip at the bottom.
            s = n * (1 - y / height)          # i + j, 0 at the tip
            d = n * (x - width / 2) / (width / 2) / 1  # j - i scaled so the base spans -n..n
            u, v = (s - d) / 2, (s + d) / 2
            i, j = math.floor(u), math.floor(v)
            colour = (255, 255, 255)
            if u >= 0 and v >= 0 and i + j < n:
                o = int((u - i) + (v - j) >= 1)
                if i + j + o < n:
                    t = (i + j + o) ** 2 + 2 * i + o
                    fu, fv = u - i, v - j
                    edge = min(fu, fv, 1 - fu - fv) if not o else min(1 - fu, 1 - fv, fu + fv - 1)
                    colour = (200, 40, 40) if t in marks else (30, 30, 30) if solution[t] else (225, 225, 225)
                    if edge < 0.03:
                        colour = (140, 140, 140)
            row += bytes(colour)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def load(files=None):
    files = [Path(f) for f in files] if files else sorted(DESIGNS.glob("*.txt"))
    puzzles = [p for f in files for p in parse(f.read_text(), f.name)]
    dates = [p["date"] for p in puzzles]
    duplicates = {d for d in dates if dates.count(d) > 1}
    if duplicates:
        raise ValueError(f"duplicate dates: {sorted(duplicates)}")
    return puzzles


def check(files):
    PREVIEW.mkdir(exist_ok=True)
    ok = True
    for p in load(files):
        n, sol = p["size"], p["solution"]
        solved, rounds, initial = deduce(n, sol)
        filled = sum(sol)
        png(n, sol, PREVIEW / f"{p['date']}.png", width=300)
        status = "ok" if solved else "NOT LINE-SOLVABLE"
        extra = ""
        if not solved:
            ok = False
            stuck = undetermined(n, sol)
            png(n, sol, PREVIEW / f"{p['date']}-stuck.png", marks=set(stuck), width=300)
            extra = f" ({len(stuck)} cells stuck; see preview/{p['date']}-stuck.png)"
        print(f"{p['date']} {p['name']!r}: n={n} filled={filled}/{n*n} rounds={rounds} first-round={initial} {status}{extra}")
    return ok


def build():
    out = []
    for p in load():
        solved, rounds, _ = deduce(p["size"], p["solution"])
        if not solved:
            raise SystemExit(f"{p['date']} {p['name']!r} is not line-solvable; run check")
        out.append({"date": p["date"], "name": p["name"], "code": encode(p["size"], p["solution"], p["orientation"]),
                    "size": p["size"], "rounds": rounds})
    out.sort(key=lambda d: d["date"])
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {len(out)} dailies to {OUT}")


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "check"
    if command == "check":
        sys.exit(0 if check(sys.argv[2:]) else 1)
    elif command == "build":
        build()
    elif command == "show":
        n, sol, orientation = decode(sys.argv[2])
        print(ascii_art(n, sol), f"\norientation {orientation}")
    else:
        raise SystemExit(__doc__)
