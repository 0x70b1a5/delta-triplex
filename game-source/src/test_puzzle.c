#include "puzzle.h"
#include "levels.h"
#include <assert.h>
#include <stdio.h>
int main(void) {
    for(int p=0;p<PUZZLE_COUNT;p++) {
        printf("Checking %s...\n",names[p]);
        Board b;board_init(&b,sizes[p],patterns[p]);assert(b.count==b.n*b.n);
        for(int a=0;a<3;a++) {
            int seen[MAX_TILES]={0};
            for(int r=0;r<b.n;r++) {
                Line *l=&b.lines[a][r];assert(l->count==2*(b.n-r)-1);
                for(int q=0;q<l->count;q++){int t=l->tile[q];seen[t]++;assert(tile_line(&b,t,a)==r);}
            }
            for(int t=0;t<b.count;t++)assert(seen[t]==1);
        }
        // C must progress left to right in screen coordinates (x proportional to j-i).
        for(int r=0;r<b.n;r++) {
            Line *l=&b.lines[2][r];
            for(int q=1;q<l->count;q++) {
                Tile prev=b.tiles[l->tile[q-1]],next=b.tiles[l->tile[q]];
                assert(prev.j-prev.i < next.j-next.i);
            }
        }
        assert(!board_solved(&b));
        for(int t=0;t<b.count;t++)b.tiles[t].state=b.tiles[t].solution;
        assert(board_solved(&b));
        for(int t=0;t<b.count;t++)if(b.tiles[t].active){b.tiles[t].state^=1;assert(!board_solved(&b));b.tiles[t].state^=1;}
        for(int t=0;t<b.count;t++)if(b.tiles[t].active&&!b.tiles[t].solution)b.tiles[t].state=2;
        assert(board_solved(&b));
    }
    Board holes;board_init(&holes,2,"1.11");
    assert(holes.lines[0][0].clue_count==2);assert(holes.lines[0][0].clue[0]==1);assert(holes.lines[0][0].clue[1]==1);
    puts("PASS: three strip partitions, cell counts, clue checks, win checks, crosses, and holes.");
}
