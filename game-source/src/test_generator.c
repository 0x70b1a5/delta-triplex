#include "generator.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static void signature(const Board *b,char *out){
    int k=0;
    for(int a=0;a<3;a++)for(int r=0;r<b->n;r++){
        const Line *l=&b->lines[a][r];
        for(int p=0;p<l->clue_count;p++)out[k++]='A'+l->clue[p];
        out[k++]='/';
    }
    out[k]=0;
}
int main(void){
    // Independent exhaustive enumeration verifies the deduction certificate on
    // all 4- and 9-cell solutions, including ambiguous clue sets.
    static char keys[512][256];static int certified[512];
    for(int n=2;n<=3;n++){
        int total=1<<(n*n);Board b;char pattern[MAX_TILES+1];
        for(int bits=0;bits<total;bits++){
            for(int t=0;t<n*n;t++)pattern[t]='0'+((bits>>t)&1);
            pattern[n*n]=0;board_init(&b,n,pattern);
            signature(&b,keys[bits]);certified[bits]=puzzle_deduce(&b).solved;
        }
        for(int bits=0;bits<total;bits++)if(certified[bits]){
            int matches=0;for(int other=0;other<total;other++)matches+=!strcmp(keys[bits],keys[other]);
            assert(matches==1);
        }
    }
    for(int d=0;d<5;d++){
        Board b,again;Deduction rating;int accepted=0;
        for(unsigned int s=1;s<4000&&accepted<100;s++){
            unsigned int seed=s*2654435761u;
            if(!puzzle_generate(d,seed,&b,&rating))continue;
            assert((b.n==(int[]){4,6,8,10,3}[d]));assert(rating.solved);
            assert((rating.rounds>=(int[]){2,3,5,7,1}[d]));
            assert(puzzle_generate(d,seed,&again,NULL));
            assert(!memcmp(&b,&again,sizeof b));
            for(int t=0;t<b.count;t++)b.tiles[t].state=b.tiles[t].solution;
            assert(board_solved(&b));accepted++;
        }
        assert(accepted==100);
    }
    puts("PASS: exhaustive small-board uniqueness certificates and 100 reproducible, solvable generated puzzles per difficulty.");
}
