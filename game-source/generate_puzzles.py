"""Deterministic puzzle authoring and line-propagation verification; stdlib only."""
import itertools, random
from pathlib import Path

def cells(n):
    return [(i,j,o) for i in range(n) for j in range(n-i) for o in range(2) if i+j+o<n]

def runs(bits):
    return tuple(len(list(g)) for v,g in itertools.groupby(bits) if v)

def lines(n,cs):
    return [sorted([t for t,(i,j,o) in enumerate(cs) if (i,j,n-1-i-j-o)[a]==r],
                   key=lambda t:-1*(2*cs[t][1 if a==0 else 0]+cs[t][2]))
            for a in range(3) for r in range(n)]

def solve(n,pattern):
    cs=cells(n); ls=lines(n,cs);known={t:0 for t,v in enumerate(pattern) if v=='.'}
    candidates=[]
    for line in ls:
        clue=runs([pattern[t]=='1' for t in line])
        candidates.append([bits for bits in itertools.product((0,1),repeat=len(line)) if runs(bits)==clue])
    while True:
        before=len(known)
        for line,opts in zip(ls,candidates):
            opts[:]=[bs for bs in opts if all(t not in known or known[t]==v for t,v in zip(line,bs))]
            assert opts, 'Contradictory puzzle'
            for p,t in enumerate(line):
                values={bs[p] for bs in opts}
                if len(values)==1: known[t]=values.pop()
        if len(known)==len(cs): return True
        if len(known)==before:return False

def main():
    rng=random.Random(6042); puzzles=[]
    for index,n in enumerate([4,5,6,6]):
        name = f'levels.{index}'
        cs=cells(n)
        for attempt in range(2000):
            pattern=''.join('.' if index==3 and i in (1,2) and j==1 else str(int(rng.random()<0.53)) for i,j,o in cs)
            if solve(n,pattern):break
        else:raise RuntimeError('Could not generate a logical puzzle')
        puzzles.append((n,name,pattern))
        print(f'{name}: {n*n} slots, {pattern.count(".")} holes; solved by line deduction, unique')
    header='// Generated and verified by generate_puzzles.py\n#define PUZZLE_COUNT 4\n'
    header+='static const int sizes[]={'+','.join(str(n) for n,_,_ in puzzles)+'};\n'
    header+='static const char *names[]={'+','.join('"'+name+'"' for _,name,_ in puzzles)+'};\n'
    header+='static const char *patterns[]={'+','.join('"'+p+'"' for _,_,p in puzzles)+'};\n'
    Path(__file__).with_name('src').joinpath('levels.h').write_text(header)
if __name__=='__main__':main()
