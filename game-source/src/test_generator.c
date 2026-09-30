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
    // Solubility agrees with exhaustive enumeration on every 9- and 16-cell board.
    for(int n=3;n<=4;n++){
        static char all[1<<16][40];static int kinds[4];memset(kinds,0,sizeof kinds);
        int total=1<<(n*n);Board b;char pattern[MAX_TILES+1];
        for(int bits=0;bits<total;bits++){
            for(int t=0;t<n*n;t++)pattern[t]='0'+((bits>>t)&1);
            pattern[n*n]=0;board_init(&b,n,pattern);signature(&b,all[bits]);
        }
        for(int bits=0;bits<total;bits++){
            for(int t=0;t<n*n;t++)pattern[t]='0'+((bits>>t)&1);
            pattern[n*n]=0;board_init(&b,n,pattern);
            Solubility s=puzzle_solubility(&b);kinds[s]++;
            if(n==3){
                int matches=0;for(int other=0;other<total;other++)matches+=!strcmp(all[bits],all[other]);
                assert((matches>1)==(s==SOLUBLE_AMBIGUOUS));
            }
        }
        if(n==3)assert(kinds[SOLUBLE_LINES]==503&&kinds[SOLUBLE_GUESSING]==0&&kinds[SOLUBLE_AMBIGUOUS]==9);
        else assert(kinds[SOLUBLE_LINES]==62715&&kinds[SOLUBLE_GUESSING]==222&&kinds[SOLUBLE_AMBIGUOUS]==2599);
        assert(!kinds[SOLUBLE_UNKNOWN]);
    }
    {
        // Largest boards finish within the search budget.
        Board b;char pattern[MAX_TILES+1];unsigned int x=12345;int kinds[4]={0};
        for(int k=0;k<300;k++){
            for(int t=0;t<100;t++){x^=x<<13;x^=x>>17;x^=x<<5;pattern[t]='0'+(x%100<(unsigned)(30+k%40));}
            pattern[100]=0;board_init(&b,10,pattern);kinds[puzzle_solubility(&b)]++;
        }
        printf("n=10 random: lines %d guessing %d ambiguous %d unknown %d\n",kinds[0],kinds[1],kinds[2],kinds[3]);
        assert(!kinds[SOLUBLE_UNKNOWN]);
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
    // Endless numbering: fixed, and never repeating a board.
    assert(endless_count(4)==414&&endless_count(0)==52532);
    assert(endless_count(1)==0&&endless_count(2)==0&&endless_count(3)==0);
    for(int d=0;d<5;d++){
        Board b,again;Deduction rating;
        assert(!endless_puzzle(d,0,&b,NULL)&&!endless_puzzle(d,-1,&b,NULL));
        int limit=d==4?414:d==0?3000:d==3?40:200;
        static char seen[60000][101];
        for(int number=1;number<=limit;number++){
            assert(endless_puzzle(d,number,&b,&rating));
            assert((b.n==(int[]){4,6,8,10,3}[d]));assert(rating.solved);
            assert((rating.rounds>=(int[]){2,3,5,7,1}[d]));
            assert(endless_puzzle(d,number,&again,NULL)&&!memcmp(&b,&again,sizeof b));
            for(int t=0;t<b.count;t++)seen[number-1][t]='0'+b.tiles[t].solution;
            seen[number-1][b.count]=0;
            for(int earlier=0;earlier<number-1;earlier++)assert(strcmp(seen[earlier],seen[number-1]));
        }
    }
    {Board b;assert(!endless_puzzle(4,415,&b,NULL)&&!endless_puzzle(0,52533,&b,NULL)&&endless_puzzle(0,52532,&b,NULL));}
    puts("PASS: fixed Endless numbering: every Sprout board once, distinct Easy boards, reproducible larger sizes.");
    puts("PASS: solubility matches exhaustive enumeration on 3- and 4-sized boards.");
    puts("PASS: exhaustive small-board uniqueness certificates and 100 reproducible, solvable generated puzzles per difficulty.");
}
