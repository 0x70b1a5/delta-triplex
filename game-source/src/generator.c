#include "generator.h"
#include <string.h>

typedef struct {
    const Line *line;
    uint32_t filled,empty,any,all;
    int count;
} Options;
static void placements(Options *o,int run,int start,uint32_t bits){
    const Line *l=o->line;
    if(run==l->clue_count){
        if((bits&o->empty)||(bits&o->filled)!=o->filled)return;
        o->any|=bits;o->all&=bits;o->count++;return;
    }
    int remaining=0;
    for(int r=run;r<l->clue_count;r++)remaining+=l->clue[r]+(r>run);
    for(int p=start;p<=l->count-remaining;p++){
        uint32_t mask=((1u<<l->clue[run])-1)<<p;
        // No earlier required fill can be left behind by subsequent runs.
        uint32_t prefix=(1u<<p)-1;
        if((mask&o->empty)||((bits&o->filled&prefix)!=(o->filled&prefix)))continue;
        placements(o,run+1,p+l->clue[run]+1,bits|mask);
    }
}
Deduction puzzle_deduce(const Board *b){
    int known[MAX_TILES];
    for(int t=0;t<b->count;t++)known[t]=b->tiles[t].active?-1:0;
    Deduction result={0};
    for(int round=1;round<=b->count;round++){
        int next[MAX_TILES];memcpy(next,known,sizeof next);
        for(int a=0;a<3;a++)for(int r=0;r<b->n;r++){
            const Line *l=&b->lines[a][r];
            Options o={.line=l,.all=(1u<<l->count)-1};
            for(int p=0;p<l->count;p++){
                int v=known[l->tile[p]];
                if(v==1)o.filled|=1u<<p;
                if(v==0)o.empty|=1u<<p;
            }
            placements(&o,0,0,0);
            if(!o.count)return result;
            for(int p=0;p<l->count;p++){
                uint32_t bit=1u<<p;
                if(o.all&bit)next[l->tile[p]]=1;
                else if(!(o.any&bit))next[l->tile[p]]=0;
            }
        }
        int changed=0,count=0;
        for(int t=0;t<b->count;t++){changed+=next[t]!=known[t];count+=next[t]>=0;}
        memcpy(known,next,sizeof known);
        if(round==1)result.initial=count;
        result.rounds=round;
        if(count==b->count){result.solved=1;return result;}
        if(!changed)return result;
    }
    return result;
}
static uint32_t random_word(uint32_t *state){
    uint32_t x=*state;x^=x<<13;x^=x>>17;x^=x<<5;return *state=x;
}
bool puzzle_generate(int difficulty,uint32_t seed,Board *out,Deduction *rating){
    if(difficulty<0||difficulty>4)return false;
    static const int sizes[]={4,6,8,10,3}, minimum_rounds[]={2,3,5,7,1};
    int n=sizes[difficulty],filled=0;
    uint32_t rng=seed?seed:0x9e3779b9u;
    int density=43+random_word(&rng)%18;
    char pattern[MAX_TILES+1];
    for(int t=0;t<n*n;t++){int bit=(int)(random_word(&rng)%100)<density;pattern[t]='0'+bit;filled+=bit;}
    pattern[n*n]=0;
    if(filled<n*n/3||filled>n*n*2/3)return false;
    board_init(out,n,pattern);
    Deduction d=puzzle_deduce(out);
    if(rating)*rating=d;
    return d.solved&&d.rounds>=minimum_rounds[difficulty]&&((difficulty!=2&&difficulty!=3)||d.initial<=n*n/2);
}
