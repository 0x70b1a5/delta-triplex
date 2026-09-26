#include "raylib.h"
#include "puzzle.h"
#include "levels.h"
#include "generator.h"
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#include <emscripten/heap.h>
#include <malloc.h>
#define API EMSCRIPTEN_KEEPALIVE
EM_JS(void, store_text,(const char *key,const char *value),{
    try{localStorage.setItem(UTF8ToString(key),UTF8ToString(value));}catch(e){}
});
EM_JS(int, read_text,(const char *key,char *value,int cap),{
    try{const s=localStorage.getItem(UTF8ToString(key));if(s){stringToUTF8(s,value,cap);return 1;}}catch(e){}return 0;
});
EM_JS(void, deliver_state,(const char *json),{if(window.triState)window.triState(JSON.parse(UTF8ToString(json)));});
EM_JS(void, ready,(void),{if(window.triReady)window.triReady();});
EM_JS(void, deliver_memory,(double seconds,double capacity,double allocated,double free_bytes,double game_static,int puzzle,int w,int h),{
    if(window.triMemorySample)window.triMemorySample({seconds,capacity,allocated,free_bytes,game_static,puzzle,width:w,height:h});
});
#elif defined(TRI_TEST)
#define API
static void store_text(const char *key,const char *value);
static int read_text(const char *key,char *value,int cap);
static void deliver_state(const char *json);
#else
#define API
static void store_text(const char *k,const char *v){(void)k;(void)v;}
static int read_text(const char *k,char *v,int cap){(void)k;(void)v;(void)cap;return 0;}
static void deliver_state(const char *s){(void)s;}
#endif

#define HISTORY 256
// Preserve the existing browser save formats, independently of editor capacity.
#define SAVE_TILES 64
static const int demo_sizes[]={2,3,4};
static const char *demo_patterns[]={"1110","101010101","1101010110001110"};
static Board board;
static int level=0,tutorial=0,selected_axis=0,selected_row=0,hovered=-1;
static int history[HISTORY][MAX_TILES],history_count=0;
// Crosses placed by auto-cross rather than by hand; only meaningful while state is 2.
static bool auto_x[MAX_TILES],history_auto[HISTORY][MAX_TILES];
static int saved[PUZZLE_COUNT][SAVE_TILES],demo_saved[3][SAVE_TILES];
static bool intro_done=false,won=false,stroke=false;
static bool custom=false,editing=false;
// 0 South, 1 East, 2 North, 3 West: rotations of the canonical point-down view.
static int orientation=0,custom_revision=0;
static int author_history[HISTORY][MAX_TILES],author_history_count=0;
// Marks queued by the page so a resumed Endless board is not first announced empty.
static char resume_marks[MAX_TILES+1];
static int resume_mark_count=0;
static int canonical_id(Tile t){int r=t.i+t.j+t.o;return r*r+2*t.i+t.o;}
static void refresh_editor_solution(void){
    if(editing){
        for(int t=0;t<board.count;t++)board.tiles[t].solution=board.tiles[t].state==1;
        board_rebuild_lines(&board);
    }
    won=!editing&&board_solved(&board);
    // Crosses are annotations, so clearing them does not alter the solution.
    // The winning stroke's existing undo snapshot retains them for undo.
    if(won)for(int t=0;t<board.count;t++)if(board.tiles[t].state==2)board.tiles[t].state=0;
}
static int paint=0,view_w=900,view_h=760;
static Vector2 last_pointer;
static float half_limit=0;
static Color BG={0,0,0,255},MINT={255,255,255,255},MUTED={255,255,255,255};
static Color EMPTY={98,98,98,255};
static Color ACCENT[3]={{255,255,255,255},{255,255,255,255},{255,255,255,255}};

#define RIPPLE_COUNT 8
typedef struct { bool active; double start; int distance[MAX_TILES],max_distance; } Ripple;
static Ripple ripples[RIPPLE_COUNT];
static int next_ripple=0;
static bool motion=true,shine=false;
static double shine_start=-1, celebration_start=-1, solved_start=-1;
static bool celebrating=false;
static float celebration_angle=0,celebration_scale=1;
API void game_clear_celebration(void){solved_start=-1;celebrating=false;celebration_angle=0;celebration_scale=1;}
API void game_celebrate(void){if(motion){celebrating=true;celebration_start=-1;}}
API float game_celebration_angle(void){return celebration_angle;}
API float game_celebration_scale(void){return celebration_scale;}
static float light[MAX_TILES];
static int flash_stage[MAX_TILES];
static bool flash_colorful=false;
API void game_flash_colorful(int enabled){flash_colorful=enabled!=0;}
static int solved_axis=2;
API float game_light(int tile){return tile>=0&&tile<board.count?light[tile]:0;}
API int game_flash_stage(int tile){return tile>=0&&tile<board.count?flash_stage[tile]:0;}
static void set_light(int tile,float pulse,int stage){
    if(pulse>light[tile]){light[tile]=pulse;flash_stage[tile]=stage;}
}
API int game_celebrating(void){return celebrating;}
API void game_effect_axis(int axis){if(axis>=0&&axis<3)solved_axis=axis;}
API void game_clear_effects(void){memset(ripples,0,sizeof ripples);memset(light,0,sizeof light);solved_start=-1;shine=false;celebrating=false;celebration_angle=0;celebration_scale=1;}
API void game_motion(int enabled){motion=enabled!=0;if(!motion)game_clear_effects();}
API void game_shine(void){if(motion&&!won){shine=true;shine_start=-1;}}
static bool adjacent(int a,int b){
    Tile x=board.tiles[a],y=board.tiles[b];if(x.o==y.o)return false;
    if(x.o){Tile swap=x;x=y;y=swap;}
    return (y.i==x.i&&y.j==x.j)||(y.i==x.i-1&&y.j==x.j)||(y.i==x.i&&y.j==x.j-1);
}
static void ripple(int source){
    if(!motion)return;
    Ripple *r=&ripples[next_ripple++%RIPPLE_COUNT];r->active=true;r->start=-1;r->max_distance=0;
    for(int i=0;i<MAX_TILES;i++)r->distance[i]=-1;
    int queue[MAX_TILES],head=0,tail=0;queue[tail++]=source;r->distance[source]=0;
    while(head<tail){int a=queue[head++];
        for(int b=0;b<board.count;b++)if(board.tiles[b].active&&r->distance[b]<0&&adjacent(a,b)){
            r->distance[b]=r->distance[a]+1;r->max_distance=r->distance[b];queue[tail++]=b;
        }
    }
}
// One shared-edge hop is 55ms. The pulse itself lasts 260ms.
static float ripple_pulse(double age,int distance){
    float phase=(age-distance*55)/260.0f;
    if(phase<0||phase>1)return 0;
    float envelope=fminf(1,phase/.12f)*(1-phase)*(1-phase);
    return .48f*envelope/(1+.10f*distance);
}
// Clue numerals continue the ripple past the strip's outer cell, one hop each.
static int clue_echo_span(void){
    int span=1;
    for(int a=0;a<3;a++)for(int r=0;r<board.n;r++){
        int n=board.lines[a][r].clue_count;if(n<1)n=1;if(n>span)span=n;
    }
    return span;
}
static double effects_now=0;
// Virtual cells beyond `tile`: extra 1 is the numeral nearest the board.
API float game_echo_light(int tile,int extra){
    if(!motion||tile<0||tile>=board.count||extra<0)return 0;
    float best=0;
    for(int i=0;i<RIPPLE_COUNT;i++){
        Ripple *r=&ripples[i];
        if(!r->active||r->start<0||r->distance[tile]<0)continue;
        float pulse=ripple_pulse(effects_now-r->start,r->distance[tile]+extra);
        if(pulse>best)best=pulse;
    }
    return best;
}
API int game_echo_stage(int tile,int extra){
    if(!motion||tile<0||tile>=board.count||extra<0)return 0;
    float best=0;int stage=0;
    for(int i=0;i<RIPPLE_COUNT;i++){
        Ripple *r=&ripples[i];
        if(!r->active||r->start<0||r->distance[tile]<0)continue;
        int distance=r->distance[tile]+extra;
        float pulse=ripple_pulse(effects_now-r->start,distance);
        if(pulse>best){best=pulse;stage=distance;}
    }
    return stage;
}
API int game_effects(double now){
    effects_now=now;memset(light,0,sizeof light);bool active=false;
    for(int i=0;i<RIPPLE_COUNT;i++){
        Ripple *r=&ripples[i];if(!r->active)continue;if(r->start<0)r->start=now;
        double age=now-r->start;
        if(age>r->max_distance*55+clue_echo_span()*55+260){r->active=false;continue;}active=true;
        for(int t=0;t<board.count;t++)if(r->distance[t]>=0)
            set_light(t,ripple_pulse(age,r->distance[t]),r->distance[t]);
    }
    if(!won||!motion)solved_start=-1;
    if(won&&motion){
        if(solved_start<0)solved_start=now;
        shine=false;active=true;
        double step=(now-solved_start)/500.0;
        int wave=(int)step%(2*board.n-1);
        // Shared-edge distance from the visible tip, in every orientation.
        float pulse=.18f+.12f*cosf((step-floor(step))*PI);
        for(int t=0;t<board.count;t++)
            if(2*(board.n-1-tile_line(&board,t,solved_axis))-board.tiles[t].o==wave)
                set_light(t,pulse,(int)step);
    }
    if(shine){
        if(shine_start<0)shine_start=now;
        float progress=(now-shine_start)/850;
        if(progress>=1)shine=false;
        else{
            active=true;Line *l=&board.lines[selected_axis][selected_row];
            for(int i=0;i<l->count;i++){
                float phase=progress*(l->count+3)-i;
                if(phase>0&&phase<3){float wave=sinf(phase*PI/3);set_light(l->tile[i],.14f*wave*wave,i);}
            }
        }
    }
    if(celebrating){
        if(celebration_start<0)celebration_start=now;
        float t=fminf(1,fmaxf(0,(now-celebration_start)/500));
        celebration_angle=360*(1-(1-t)*(1-t)*(1-t));
        float u=t<.5f?t*2:(1-t)*2;
        celebration_scale=1+.1f*u*u*(3-2*u);
        if(t>=1){celebrating=false;celebration_angle=0;celebration_scale=1;}
        else active=true;
    }
    return active;
}

static void sync_state(void){
    char json[24576];int used=snprintf(json,sizeof json,
        "{\"n\":%d,\"level\":%d,\"tutorial\":%d,\"won\":%s,\"undo\":%s,\"history\":%d,\"axis\":%d,\"row\":%d,\"hover\":[",
        board.n,custom?-1:level,custom?-1:tutorial,won?"true":"false",history_count?"true":"false",history_count,selected_axis,selected_row);
    for(int a=0;a<3;a++)used+=snprintf(json+used,sizeof json-used,"%s%d",a?",":"",hovered<0?-1:tile_line(&board,hovered,a));
    used+=snprintf(json+used,sizeof json-used,"],\"clues\":[");
    for(int a=0;a<3;a++){
        used+=snprintf(json+used,sizeof json-used,"%s[",a?",":"");
        for(int r=0;r<board.n;r++){
            Line *l=&board.lines[a][r];
            used+=snprintf(json+used,sizeof json-used,"%s{\"match\":%s,\"runs\":[",r?",":"",line_matches(&board,l)?"true":"false");
            for(int p=0;p<l->clue_count;p++)used+=snprintf(json+used,sizeof json-used,"%s%d",p?",":"",l->clue[p]);
            used+=snprintf(json+used,sizeof json-used,"]}");
        }
        used+=snprintf(json+used,sizeof json-used,"]");
    }
    used+=snprintf(json+used,sizeof json-used,"],\"custom\":%s,\"editing\":%s,\"orientation\":%d,\"revision\":%d",custom?"true":"false",editing?"true":"false",orientation,custom_revision);
    used+=snprintf(json+used,sizeof json-used,",\"cells\":[");
    for(int t=0;t<board.count;t++){
        Tile c=board.tiles[t];
        used+=snprintf(json+used,sizeof json-used,"%s{\"i\":%d,\"j\":%d,\"o\":%d,\"active\":%s,\"state\":%d}",t?",":"",c.i,c.j,c.o,c.active?"true":"false",c.state);
    }
    used+=snprintf(json+used,sizeof json-used,"]");
    {
        int solution[MAX_TILES]={0};
        for(int t=0;t<board.count;t++)solution[canonical_id(board.tiles[t])]=board.tiles[t].solution;
        used+=snprintf(json+used,sizeof json-used,",\"solution\":[");
        for(int t=0;t<board.count;t++)used+=snprintf(json+used,sizeof json-used,"%s%d",t?",":"",solution[t]);
        used+=snprintf(json+used,sizeof json-used,"]");
    }
    used+=snprintf(json+used,sizeof json-used,",\"levels\":[");
    for(int l=0;l<PUZZLE_COUNT;l++)used+=snprintf(json+used,sizeof json-used,"%s\"%s\"",l?",":"",names[l]);
    snprintf(json+used,sizeof json-used,"]}");deliver_state(json);
}
static void remember_board(void){
    if(custom)return;
    int *destination=tutorial>=0?demo_saved[tutorial]:saved[level];
    for(int t=0;t<board.count;t++)destination[t]=board.tiles[t].state;
}
static void persist(void){
    if(custom)return;
    remember_board();
    char data[PUZZLE_COUNT*SAVE_TILES+2];int p=0;data[p++]='0'+level;
    for(int l=0;l<PUZZLE_COUNT;l++)for(int t=0;t<SAVE_TILES;t++)data[p++]='0'+saved[l][t];
    data[p]=0;store_text("tri-rotate-progress-v1",data);
    char intro[3*SAVE_TILES+2];p=0;intro[p++]=intro_done?'D':'0'+tutorial;
    for(int l=0;l<3;l++)for(int t=0;t<SAVE_TILES;t++)intro[p++]='0'+demo_saved[l][t];
    intro[p]=0;store_text("tri-rotate-intro-v1",intro);
}
static void load_board(void){
    custom=false;editing=false;orientation=0;
    game_clear_effects();
    board_init(&board,tutorial>=0?demo_sizes[tutorial]:sizes[level],tutorial>=0?demo_patterns[tutorial]:patterns[level]);
    int *source=tutorial>=0?demo_saved[tutorial]:saved[level];
    for(int t=0;t<board.count;t++)if(board.tiles[t].active)board.tiles[t].state=source[t];
    memset(auto_x,0,sizeof auto_x);
    history_count=0;selected_axis=0;selected_row=0;hovered=-1;stroke=false;refresh_editor_solution();
    sync_state();
}
API void game_boot(void){
    char data[PUZZLE_COUNT*SAVE_TILES+2]={0};
    if(read_text("tri-rotate-progress-v1",data,sizeof data)&&strlen(data)==PUZZLE_COUNT*SAVE_TILES+1){
        int l=data[0]-'0';if(l>=0&&l<PUZZLE_COUNT)level=l;
        int p=1;for(int a=0;a<PUZZLE_COUNT;a++)for(int t=0;t<SAVE_TILES;t++){int v=data[p++]-'0';saved[a][t]=v>=0&&v<=2?v:0;}
    }
    char intro[3*SAVE_TILES+2]={0};
    if(read_text("tri-rotate-intro-v1",intro,sizeof intro)&&strlen(intro)==3*SAVE_TILES+1){
        intro_done=intro[0]=='D';int stage=intro[0]-'0';tutorial=intro_done?-1:(stage>=0&&stage<3?stage:0);
        int p=1;for(int a=0;a<3;a++)for(int t=0;t<SAVE_TILES;t++){int v=intro[p++]-'0';demo_saved[a][t]=v>=0&&v<=2?v:0;}
    }
    load_board();
}
static void snapshot(void){
    if(history_count==HISTORY){
        memmove(history,history+1,sizeof history-sizeof history[0]);
        memmove(history_auto,history_auto+1,sizeof history_auto-sizeof history_auto[0]);history_count--;
    }
    for(int t=0;t<board.count;t++){history[history_count][t]=board.tiles[t].state;history_auto[history_count][t]=auto_x[t];}
    history_count++;
}
static float half_side(void){
    float half=orientation%2?fminf((view_h-96)*0.5f,(view_w-144)/1.7320508f):fminf((view_w-96)*0.5f,(view_h-144)/1.7320508f);
    if(half_limit>0)half=fminf(half,half_limit);
    return fmaxf(1,half);
}
static Vector2 vertex(int i,int j){
    float half=half_side(),d=half/board.n,height=half*1.7320508f;
    float x=(j-i)*d,y=-height*0.5f+(board.n-i-j)*d*1.7320508f;
    if(orientation==1){float temp=x;x=y;y=-temp;}
    else if(orientation==2){x=-x;y=-y;}
    else if(orientation==3){float temp=x;x=-y;y=temp;}
    return (Vector2){view_w*0.5f+x,view_h*0.5f+y};
}
static void corners(int t,Vector2 *a,Vector2 *b,Vector2 *c){
    Tile x=board.tiles[t];
    if(!x.o){*a=vertex(x.i,x.j);*b=vertex(x.i,x.j+1);*c=vertex(x.i+1,x.j);}
    else{*a=vertex(x.i+1,x.j);*b=vertex(x.i,x.j+1);*c=vertex(x.i+1,x.j+1);}
}
static Vector2 center(int t){Vector2 a,b,c;corners(t,&a,&b,&c);return (Vector2){(a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3};}
// Use the geometric centroid even when no cell centre lies on it.
static Camera2D celebration_camera(void){
    Vector2 a=vertex(0,0),b=vertex(board.n,0),c=vertex(0,board.n);
    Vector2 pivot={(a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3};
    return (Camera2D){.offset=pivot,.target=pivot,.rotation=celebration_angle,.zoom=celebration_scale};
}
// Gap is the perpendicular distance between two neighbouring rendered cells.
static float cell_inset(void){
    float old=fminf(.97f,1-2.0f/fmaxf(3,half_side()/board.n));
    return fmaxf(.08f,1-2*(1-old));
}
static float cell_gap(void){return 2*(half_side()/board.n)/1.7320508f*(1-cell_inset());}
static void drawn_corners(int t,Vector2 *a,Vector2 *b,Vector2 *c){
    corners(t,a,b,c);Vector2 m=center(t);float k=cell_inset();
    *a=(Vector2){m.x+(a->x-m.x)*k,m.y+(a->y-m.y)*k};
    *b=(Vector2){m.x+(b->x-m.x)*k,m.y+(b->y-m.y)*k};
    *c=(Vector2){m.x+(c->x-m.x)*k,m.y+(c->y-m.y)*k};
}
static float turn(Vector2 a,Vector2 b,Vector2 c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
static int compare_points(const void *aa,const void *bb){
    const Vector2 *a=aa,*b=bb;
    return a->x<b->x?-1:a->x>b->x?1:a->y<b->y?-1:a->y>b->y?1:0;
}
// One convex envelope for the strip, including gaps between its triangles.
static int strip_hull(Vector2 *h){
    Vector2 p[MAX_TILES*3];int n=0,k=0;
    for(int t=0;t<board.count;t++)if(board.tiles[t].active&&tile_line(&board,t,selected_axis)==selected_row){
        drawn_corners(t,&p[n],&p[n+1],&p[n+2]);n+=3;
    }
    if(n<3)return 0;
    qsort(p,n,sizeof *p,compare_points);
    for(int i=0;i<n;i++){while(k>=2&&turn(h[k-2],h[k-1],p[i])<=.001f)k--;h[k++]=p[i];}
    int lower=k+1;
    for(int i=n-2;i>=0;i--){while(k>=lower&&turn(h[k-2],h[k-1],p[i])<=.001f)k--;h[k++]=p[i];}
    return k-1;
}
static Vector2 label_anchor(void){
    Vector2 hull[MAX_TILES*6];int n=strip_hull(hull);Vector2 top={0,1e9f};
    for(int i=0;i<n;i++)if(hull[i].y<top.y-.01f||(fabsf(hull[i].y-top.y)<.01f&&hull[i].x<top.x))top=hull[i];
    // Top tangent begins at the leftmost top hull vertex. Outer stroke is 3 gaps out.
    top.y-=4*cell_gap();return top;
}
API float game_label_x(void){return label_anchor().x;}
API float game_label_y(void){return label_anchor().y;}
static void strip_outline(void){
    Vector2 h[MAX_TILES*6];int n=strip_hull(h);if(n<3)return;
    float width=cell_gap(),radius=2.5f*width; // inner stroke edge is two gaps away
    Vector2 first={0},previous={0};bool started=false;
    for(int i=0;i<n;i++){
        Vector2 a=h[(i+n-1)%n],b=h[i],c=h[(i+1)%n];
        float start=atan2f(-(b.x-a.x),b.y-a.y),end=atan2f(-(c.x-b.x),c.y-b.y);
        while(end<start)end+=2*PI;
        int steps=(int)ceilf((end-start)/.10f);if(steps<1)steps=1;
        for(int j=0;j<=steps;j++){
            float angle=start+(end-start)*j/steps;
            Vector2 q={b.x+radius*cosf(angle),b.y+radius*sinf(angle)};
            if(started)DrawLineEx(previous,q,width,ACCENT[selected_axis]);else{first=q;started=true;}
            DrawCircleV(q,width*.5f,ACCENT[selected_axis]);previous=q;
        }
    }
    DrawLineEx(previous,first,width,ACCENT[selected_axis]);
}
static Color rgb(int x){return (Color){(x>>16)&255,(x>>8)&255,x&255,255};}
API void game_palette(int bg,int cell,int empty,int muted,int a,int b,int c){
    BG=rgb(bg);MINT=rgb(cell);EMPTY=rgb(empty);MUTED=rgb(muted);
    ACCENT[0]=rgb(a);ACCENT[1]=rgb(b);ACCENT[2]=rgb(c);
}
static int hit(Vector2 p){
    for(int t=0;t<board.count;t++)if(board.tiles[t].active){Vector2 a,b,c;corners(t,&a,&b,&c);if(CheckCollisionPointTriangle(p,a,b,c))return t;}
    return -1;
}
static bool mark(Vector2 p){int t=hit(p);if(t>=0)auto_x[t]=false;if(t<0||board.tiles[t].state==paint)return false;board.tiles[t].state=paint;return true;}
API void game_resize(int w,int h){if(w>0&&h>0){view_w=w;view_h=h;half_limit=0;}}
API void game_limit(float half){half_limit=half;}
API void game_hover(float x,float y){int t=hit((Vector2){x,y});if(t!=hovered){hovered=t;sync_state();}}
API void game_down(float x,float y,int tool){
    Vector2 p={x,y};int t=hit(p);if(t<0)return;
    paint=editing?(board.tiles[t].state==1?0:1):(tool==2?(board.tiles[t].state==2?0:2):(board.tiles[t].state+1)%3);snapshot();stroke=true;last_pointer=p;
    if(paint==1)ripple(t);
    mark(p);hovered=t;refresh_editor_solution();sync_state();
}
API void game_move(float x,float y){
    Vector2 p={x,y};bool changed=false;
    if(stroke){
        float distance=hypotf(p.x-last_pointer.x,p.y-last_pointer.y);
        int steps=(int)ceilf(distance/fmaxf(2,half_side()/board.n/6));
        for(int i=1;i<=steps;i++){float u=(float)i/steps;changed|=mark((Vector2){last_pointer.x+(p.x-last_pointer.x)*u,last_pointer.y+(p.y-last_pointer.y)*u});}
        last_pointer=p;
    }
    int t=hit(p);if(changed||t!=hovered){hovered=t;refresh_editor_solution();sync_state();}
}
// Opt-in: once a line's clue is met, cross its remaining unknown cells. Applied
// when a stroke ends so a drag never crosses cells it is about to paint, and so
// the stroke's snapshot undoes its crosses too. Matching is by run pattern only,
// so a clue met in the wrong place propagates that mistake. An auto cross whose
// lines all stop matching reverts to unknown; crosses placed by hand never do.
static bool auto_cross=false;
static bool apply_auto_cross(void){
    if(!auto_cross||editing||won||(!custom&&tutorial>=0))return false;
    bool changed=false,keep[MAX_TILES]={0};
    for(int a=0;a<3;a++)for(int r=0;r<board.n;r++){
        Line *l=&board.lines[a][r];if(!line_matches(&board,l))continue;
        for(int p=0;p<l->count;p++){
            int i=l->tile[p];Tile *t=&board.tiles[i];if(!t->active)continue;
            if(t->state==0){t->state=2;auto_x[i]=true;changed=true;}
            if(auto_x[i])keep[i]=true;
        }
    }
    // Crosses and unknowns count alike for matching, so reverting cannot change which lines match.
    for(int i=0;i<board.count;i++)if(auto_x[i]&&!keep[i]){
        auto_x[i]=false;if(board.tiles[i].state==2){board.tiles[i].state=0;changed=true;}
    }
    return changed;
}
API void game_up(void){if(stroke){stroke=false;if(apply_auto_cross())sync_state();persist();}}
API void game_auto_cross(int enabled){
    auto_cross=enabled!=0;
    if(stroke)return;
    // Turning it on crosses already-met lines as one undoable step.
    snapshot();
    if(!apply_auto_cross()){history_count--;return;}
    persist();sync_state();
}
API void game_select(int a,int r){if(a>=0&&a<3&&r>=0&&r<board.n){selected_axis=a;selected_row=r;shine=false;sync_state();}}
API void game_undo(void){
    game_up();if(!history_count)return;
    history_count--;for(int t=0;t<board.count;t++){board.tiles[t].state=history[history_count][t];auto_x[t]=history_auto[history_count][t];}
    refresh_editor_solution();persist();sync_state();
}
API void game_reset(void){
    game_up();snapshot();memset(auto_x,0,sizeof auto_x);for(int t=0;t<board.count;t++)board.tiles[t].state=0;
    refresh_editor_solution();persist();sync_state();
}
// Custom puzzles use the same board, rules, rendering and history as built-in levels.
// Empty or invalid input drops any queued resume so it cannot leak onto a later board.
API void game_resume_marks(const char *marks){
    resume_mark_count=0;
    if(!marks)return;
    int n=(int)strlen(marks);
    if(n<1||n>MAX_TILES)return;
    for(int i=0;i<n;i++)if(marks[i]<'0'||marks[i]>'2')return;
    memcpy(resume_marks,marks,(size_t)n);
    resume_marks[n]=0;resume_mark_count=n;
}
API int game_custom(int n,int direction,const char *canonical,int author){
    if(n<2||n>MAX_N||direction<0||direction>3||!canonical||(int)strlen(canonical)!=n*n){resume_mark_count=0;return 0;}
    for(int t=0;t<n*n;t++)if(canonical[t]!='0'&&canonical[t]!='1'){resume_mark_count=0;return 0;}
    game_up();persist();
    char pattern[MAX_TILES+1];int t=0;
    for(int i=0;i<n;i++)for(int j=0;j<n-i;j++)for(int o=0;o<2;o++){
        if(i+j+o>=n)continue;
        pattern[t++]=canonical[canonical_id((Tile){.i=i,.j=j,.o=o})];
    }
    pattern[t]=0;custom=true;editing=author!=0;orientation=direction;custom_revision++;
    board_init(&board,n,pattern);
    for(int i=0;i<board.count;i++)board.tiles[i].state=editing?board.tiles[i].solution:0;
    if(!editing&&resume_mark_count==board.count)for(int i=0;i<board.count;i++)board.tiles[i].state=resume_marks[i]-'0';
    resume_mark_count=0;
    memset(auto_x,0,sizeof auto_x);
    history_count=author_history_count=0;selected_axis=selected_row=0;hovered=-1;stroke=false;
    game_clear_effects();refresh_editor_solution();sync_state();return 1;
}
API void game_editing(int author){
    if(!custom||editing==(author!=0))return;
    game_up();game_clear_effects();editing=author!=0;
    if(editing){memcpy(history,author_history,sizeof history);history_count=author_history_count;}
    else {memcpy(author_history,history,sizeof history);author_history_count=history_count;history_count=0;}
    for(int t=0;t<board.count;t++)board.tiles[t].state=editing?board.tiles[t].solution:0;
    memset(auto_x,0,sizeof auto_x);hovered=-1;refresh_editor_solution();sync_state();
}
API void game_orientation(int direction){
    if(!custom||direction<0||direction>3)return;
    game_up();orientation=direction;game_clear_effects();sync_state();
}
API void game_leave_custom(void){if(custom){game_up();load_board();}}
API void game_level(int l){if(l<0||l>=PUZZLE_COUNT)return;game_up();persist();custom=false;editing=false;intro_done=true;tutorial=-1;level=l;load_board();persist();}
// Generation works in isolation: rejected attempts never replace the active board.
API const char *game_generate(int difficulty,unsigned int seed){
    static char json[1024];Board candidate;Deduction rating;
    if(!puzzle_generate(difficulty,seed,&candidate,&rating))return "";
    int solution[MAX_TILES]={0};
    for(int t=0;t<candidate.count;t++)solution[canonical_id(candidate.tiles[t])]=candidate.tiles[t].solution;
    int used=snprintf(json,sizeof json,"{\"format\":\"tri-logic\",\"version\":2,\"cellOrder\":\"north-row-major\",\"size\":%d,\"rounds\":%d,\"solution\":[",candidate.n,rating.rounds);
    for(int t=0;t<candidate.count;t++)used+=snprintf(json+used,sizeof json-used,"%s%d",t?",":"",solution[t]);
    snprintf(json+used,sizeof json-used,"]}");return json;
}
API void game_new(void){
    game_up();memset(saved,0,sizeof saved);custom=false;editing=false;
    intro_done=true;tutorial=-1;level=0;load_board();persist();
}
API void game_skip(void){game_up();persist();intro_done=true;tutorial=-1;load_board();persist();}
API void game_next(void){
    if(tutorial<0||!won)return;
    game_up();persist();if(tutorial==2){game_skip();return;}
    tutorial++;load_board();persist();
}
API void game_replay(void){game_up();persist();memset(demo_saved,0,sizeof demo_saved);intro_done=false;tutorial=0;load_board();persist();}
API void game_sync(void){sync_state();}
API void game_render(void){
    if(GetScreenWidth()!=view_w||GetScreenHeight()!=view_h)SetWindowSize(view_w,view_h);
    BeginDrawing();ClearBackground(BG);
    Camera2D camera=celebration_camera();
    BeginMode2D(camera);
    for(int t=0;t<board.count;t++)if(board.tiles[t].active){
        Vector2 a,b,c;drawn_corners(t,&a,&b,&c);Vector2 mid=center(t);
        Color fill=board.tiles[t].state==1?MINT:EMPTY;
        if(t==hovered&&!won){
            Color target=board.tiles[t].state==1?BG:MINT;
            fill=(Color){(fill.r*4+target.r)/5,(fill.g*4+target.g)/5,(fill.b*4+target.b)/5,255};
        }
        static const Color rainbow[]={{255,48,48,255},{255,136,0,255},{255,221,0,255},{32,192,80,255},{32,128,255,255},{100,60,255,255},{192,64,255,255}};
        Color target=flash_colorful?WHITE:rainbow[flash_stage[t]%7];float glow=fminf(1,light[t]*(flash_colorful?1:3));
        fill=(Color){fill.r+(target.r-fill.r)*glow,fill.g+(target.g-fill.g)*glow,fill.b+(target.b-fill.b)*glow,255};
        if(board.tiles[t].state==2)fill.a=128;
        DrawTriangle(a,b,c,fill);
        if(board.tiles[t].state==2){float d=fminf(10,half_side()/board.n/6);DrawLineEx((Vector2){mid.x-d,mid.y-d},(Vector2){mid.x+d,mid.y+d},2,MUTED);DrawLineEx((Vector2){mid.x-d,mid.y+d},(Vector2){mid.x+d,mid.y-d},2,MUTED);}
    }
    if(!won)strip_outline();
    EndMode2D();
    EndDrawing();
}
API void game_memory(void){
#ifdef __EMSCRIPTEN__
    struct mallinfo info=mallinfo();
    deliver_memory(emscripten_get_now()/1000.0,emscripten_get_heap_size(),info.uordblks,info.fordblks,
        sizeof board+sizeof history+sizeof author_history+sizeof saved+sizeof demo_saved+sizeof ripples+sizeof light,tutorial>=0?-(tutorial+1):level+1,view_w,view_h);
#endif
}
int main(void){
    SetConfigFlags(FLAG_MSAA_4X_HINT);InitWindow(view_w,view_h,"Delta Triplex");SetTargetFPS(0);
    game_boot();
#ifdef __EMSCRIPTEN__
    ready(); // No main loop. JavaScript requests a frame only when something changes.
#else
    while(!WindowShouldClose()){
        Vector2 m=GetMousePosition();game_hover(m.x,m.y);
        if(IsMouseButtonPressed(MOUSE_BUTTON_LEFT)||IsMouseButtonPressed(MOUSE_BUTTON_RIGHT))game_down(m.x,m.y,IsMouseButtonPressed(MOUSE_BUTTON_RIGHT)?2:1);
        if(IsMouseButtonDown(MOUSE_BUTTON_LEFT)||IsMouseButtonDown(MOUSE_BUTTON_RIGHT))game_move(m.x,m.y);
        if(IsMouseButtonReleased(MOUSE_BUTTON_LEFT)||IsMouseButtonReleased(MOUSE_BUTTON_RIGHT))game_up();
        if(IsKeyPressed(KEY_Z))game_undo();if(IsKeyPressed(KEY_R))game_reset();
        if(IsKeyPressed(KEY_ENTER))game_next();if(IsKeyPressed(KEY_S))game_skip();
        game_effects(GetTime()*1000);game_render();WaitTime(0.02);
    }
    CloseWindow();
#endif
    return 0;
}
