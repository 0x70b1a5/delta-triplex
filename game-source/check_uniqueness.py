"""Count complete solutions for selected clue axes using propagation plus search."""
import itertools,re
from pathlib import Path
from generate_puzzles import cells,lines,runs

def count_solutions(n,pattern,axes=(0,1),limit=None):
    all_lines=lines(n,cells(n));ls=[all_lines[a*n+r] for a in axes for r in range(n)]
    candidates=[]
    for line in ls:
        clue=runs(pattern[t]=='1' for t in line)
        candidates.append([bs for bs in itertools.product((0,1),repeat=len(line)) if runs(bs)==clue])
    def search(known):
        while True:
            before=len(known);remaining=[]
            for line,opts in zip(ls,candidates):
                options=[bs for bs in opts if all(t not in known or known[t]==v for t,v in zip(line,bs))]
                if not options:return 0
                remaining.append(options)
                for p,t in enumerate(line):
                    values={bs[p] for bs in options}
                    if len(values)==1:known[t]=values.pop()
            if len(known)==n*n:
                return int(all(any(all(known[t]==v for t,v in zip(line,bs)) for bs in opts)
                               for line,opts in zip(ls,candidates)))
            if len(known)==before:break
        branch=min((k for k in range(len(ls)) if len(remaining[k])>1),key=lambda k:len(remaining[k]))
        count=0
        for bs in remaining[branch]:
            child=known.copy();child.update(zip(ls[branch],bs));count+=search(child)
            if limit is not None and count>=limit:return limit
        return count
    return search({t:0 for t,c in enumerate(pattern) if c=='.'})

if __name__=='__main__':
    h=Path(__file__).with_name('src').joinpath('levels.h').read_text()
    sizes=[int(x) for x in re.search(r'sizes\[\]=\{([^}]+)',h)[1].split(',')]
    names=re.findall(r'"([^"]+)"',re.search(r'names\[\]=\{([^}]+)',h)[1])
    patterns=re.findall(r'"([^"]+)"',re.search(r'patterns\[\]=\{([^}]+)',h)[1])
    for n,name,p in zip(sizes,names,patterns):
        print(f'{name}: A+B={count_solutions(n,p)}; A+B+C={count_solutions(n,p,(0,1,2))}')
    assert count_solutions(2,'1000')==2
    assert count_solutions(2,'0100')==2
    assert count_solutions(2,'1000',(0,1,2))==1
