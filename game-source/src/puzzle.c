#include "puzzle.h"
#include <string.h>
#include <assert.h>
int tile_line(const Board *b,int t,int axis) {
    Tile c=b->tiles[t];
    return axis==0?c.i:axis==1?c.j:b->n-1-c.i-c.j-c.o;
}
static int order(Tile t,int axis) {
    int value=2*(axis==0?t.j:t.i)+t.o;
    // Point-down board: A down-left, B down-right, C left-right.
    return -value;
}
static int runs(const Board *b,const Line *l,bool solution,int *out) {
    int count=0,run=0;
    for(int p=0;p<=l->count;p++) {
        bool filled=false;
        if(p<l->count) { Tile t=b->tiles[l->tile[p]]; filled=t.active&&(solution?t.solution:t.state==1); }
        if(filled) run++;
        else if(run) { out[count++]=run; run=0; }
    }
    return count;
}
void board_rebuild_lines(Board *b) {
    memset(b->lines,0,sizeof b->lines);
    for(int a=0;a<3;a++) for(int t=0;t<b->count;t++) {
        Line *l=&b->lines[a][tile_line(b,t,a)]; int p=l->count++;
        while(p>0&&order(b->tiles[l->tile[p-1]],a)>order(b->tiles[t],a)) {
            l->tile[p]=l->tile[p-1];p--;
        }
        l->tile[p]=t;
    }
    for(int a=0;a<3;a++) for(int r=0;r<b->n;r++) {
        Line *l=&b->lines[a][r];l->clue_count=runs(b,l,true,l->clue);
    }
}
void board_init(Board *b,int n,const char *pattern) {
    assert(n>0&&n<=MAX_N);memset(b,0,sizeof *b);b->n=n;
    assert((int)strlen(pattern)==n*n);
    for(int i=0;i<n;i++) for(int j=0;j<n-i;j++) for(int o=0;o<2;o++) {
        if(i+j+o>=n)continue;
        int t=b->count++;char c=pattern[t];
        b->tiles[t]=(Tile){i,j,o,c!='.',c=='1',0};
    }
    board_rebuild_lines(b);
}
bool line_matches(const Board *b,const Line *l) {
    int actual[MAX_LINE];int n=runs(b,l,false,actual);
    return n==l->clue_count&&!memcmp(actual,l->clue,n*sizeof(int));
}
bool board_solved(const Board *b) {
    for(int a=0;a<3;a++)for(int r=0;r<b->n;r++) if(!line_matches(b,&b->lines[a][r]))return false;
    return true;
}
