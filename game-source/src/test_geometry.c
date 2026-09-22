#define TRI_TEST
#define main application_main
#include "main.c"
#undef main
#include <assert.h>
static char stored_game[PUZZLE_COUNT*SAVE_TILES+2],stored_intro[3*SAVE_TILES+2];
static int notifications;
static void store_text(const char *key,const char *value){strcpy(strstr(key,"intro")?stored_intro:stored_game,value);}
static int read_text(const char *key,char *value,int cap){const char *s=strstr(key,"intro")?stored_intro:stored_game;if(!*s)return 0;snprintf(value,cap,"%s",s);return 1;}
static void deliver_state(const char *s){assert(s[0]=='{');notifications++;}
static void fill_solution(void){
 for(int t=0;t<board.count;t++)if(board.tiles[t].solution){Vector2 p=center(t);game_down(p.x,p.y,1);game_up();}
 assert(won);
}
int main(void){
 int accepted_seeds=0;
 for(unsigned seed=0;seed<256;seed++){
  const char *generated=game_generate(0,seed);
  if(!*generated)continue;
  char first[1024];strcpy(first,generated);
  assert(!strcmp(first,game_generate(0,seed)));
  assert(!strstr(first,"\"orientation\""));accepted_seeds++;
 }
 assert(accepted_seeds>0);
 game_boot();assert(tutorial==0&&board.n==2);
 for(int demo=0;demo<3;demo++){
  assert(tutorial==demo&&board.n==demo+2);
  game_next();assert(tutorial==demo); // Cannot advance an unfinished lesson.
  fill_solution();game_next();
 }
 assert(tutorial==-1&&intro_done&&board.n==4&&stored_intro[0]=='D');
 game_level(1);Vector2 p=center(0);game_down(p.x,p.y,1);game_up();assert(saved[1][0]==1);
 game_replay();assert(tutorial==0&&!intro_done);game_skip();assert(tutorial==-1&&level==1&&board.tiles[0].state==1);
 game_reset();assert(board.tiles[0].state==0);game_undo();assert(board.tiles[0].state==1);
 for(int layout=0;layout<2;layout++){
  game_resize(layout?380:1000,layout?420:780);
  for(int l=0;l<PUZZLE_COUNT;l++){
   game_level(l);game_reset();assert(board.count==board.n*board.n);
   assert(vertex(0,0).y>vertex(board.n,0).y);
   for(int axis=0;axis<3;axis++)for(int row=0;row<board.n;row++){
    selected_axis=axis;selected_row=row;Vector2 hull[MAX_TILES*6];int count=strip_hull(hull);assert(count>=3);
    float old=fminf(.97f,1-2.0f/fmaxf(3,half_side()/board.n));
    assert(fabsf(cell_gap()-4*(half_side()/board.n)/1.7320508f*(1-old))<.001f);
    for(int t=0;t<board.count;t++)if(tile_line(&board,t,axis)==row){
     Vector2 points[3];drawn_corners(t,&points[0],&points[1],&points[2]);
     for(int j=0;j<3;j++)for(int k=0;k<count;k++)assert(turn(hull[k],hull[(k+1)%count],points[j])>=-.05f);
    }
   }
   for(int t=0;t<board.count;t++){
    Vector2 a,b,c;corners(t,&a,&b,&c);
    float ab=hypotf(a.x-b.x,a.y-b.y),bc=hypotf(b.x-c.x,b.y-c.y),ca=hypotf(c.x-a.x,c.y-a.y);
    assert(fabsf(ab-bc)<0.001f&&fabsf(ab-ca)<0.001f);
    assert((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)<0);
    assert(hit(center(t))==(board.tiles[t].active?t:-1));
   }
   for(int a=0;a<3;a++)for(int r=0;r<board.n;r++){
    Line *ln=&board.lines[a][r];if(ln->count<2)continue;
    Vector2 first=center(ln->tile[0]),last=center(ln->tile[ln->count-1]);
    if(a==0){assert(last.x<first.x&&last.y>first.y);}
    if(a==1){assert(last.x>first.x&&last.y>first.y);}
    if(a==2){assert(last.x>first.x&&fabsf(last.y-first.y)<0.001f);}
   }
  }
 }
 game_level(0);game_reset();Line *line=&board.lines[0][0];
 Vector2 first=center(line->tile[0]),last=center(line->tile[line->count-1]);
 int before=history_count;game_down(first.x,first.y,1);game_move(last.x,last.y);game_up();
 assert(history_count==before+1);
 for(int k=0;k<line->count;k++)assert(board.tiles[line->tile[k]].state==1);
 game_undo();for(int t=0;t<board.count;t++)assert(board.tiles[t].state==0);
 p=center(0);game_down(p.x,p.y,2);game_up();assert(board.tiles[0].state==2);
 game_down(p.x,p.y,2);game_up();assert(board.tiles[0].state==0);
 game_clear_effects();game_down(p.x,p.y,1);game_up();assert(board.tiles[0].state==1);assert(game_effects(1000));
 game_clear_effects();game_down(p.x,p.y,1);game_up();assert(board.tiles[0].state==2);assert(!game_effects(2000));
 game_clear_effects();game_down(p.x,p.y,1);game_up();assert(board.tiles[0].state==0);assert(!game_effects(3000));
 game_down(p.x,p.y,2);game_up();assert(board.tiles[0].state==2);assert(!game_effects(4000));
 game_down(p.x,p.y,2);game_up();assert(board.tiles[0].state==0);assert(!game_effects(5000));
 int idle=notifications;game_hover(-100,-100);game_hover(-100,-100);assert(notifications<=idle+1);

 game_level(3);game_clear_effects();
 for(int a=0;a<board.count;a++)for(int b=a+1;b<board.count;b++){
  Vector2 av[3],bv[3];corners(a,&av[0],&av[1],&av[2]);corners(b,&bv[0],&bv[1],&bv[2]);int shared=0;
  for(int i=0;i<3;i++)for(int j=0;j<3;j++)if(hypotf(av[i].x-bv[j].x,av[i].y-bv[j].y)<.001f)shared++;
  assert(adjacent(a,b)==(shared==2));assert(adjacent(a,b)==adjacent(b,a));
 }
 int source=0;while(!board.tiles[source].active)source++;
 ripple(source);assert(game_effects(10000));
 assert(light[source]==0);game_effects(10035);assert(light[source]>.25f);
 for(int t=0;t<board.count;t++)if(!board.tiles[t].active)assert(light[t]==0);
 assert(!game_effects(20000));for(int t=0;t<board.count;t++)assert(light[t]==0);
 game_clear_effects();ripple(source);game_effects(21000);game_effects(21035);float single=light[source];
 game_clear_effects();ripple(source);ripple(source);game_effects(21000);game_effects(21035);assert(fabsf(light[source]-single)<.00001f);
 selected_axis=2;selected_row=0;game_clear_effects();game_shine();assert(game_effects(22000));game_effects(22400);
 for(int t=0;t<board.count;t++)if(tile_line(&board,t,2)!=0)assert(light[t]==0);
 assert(!game_effects(23000));
 game_motion(0);ripple(source);game_shine();assert(!game_effects(24000));game_motion(1);
 for(int a=0;a<3;a++)for(int r=0;r<board.n;r++){
  selected_axis=a;selected_row=r;Vector2 h[MAX_TILES*6];int n=strip_hull(h);Vector2 anchor=label_anchor();float top=1e9f;
  for(int i=0;i<n;i++)top=fminf(top,h[i].y);
  assert(fabsf(anchor.y-(top-4*cell_gap()))<.001f);
 }
 // Custom play and authoring exercise the same board, hit testing, clues and history.
 game_level(1);game_reset();p=center(0);game_down(p.x,p.y,1);game_up();
 char before_custom[sizeof stored_game];strcpy(before_custom,stored_game);
 char asymmetric[MAX_TILES+1];
 for(int n=2;n<=10;n++)for(int direction=0;direction<4;direction++){
  for(int id=0;id<n*n;id++)asymmetric[id]=(id%5==0||id%7==2)?'1':'0';asymmetric[n*n]=0;
  assert(game_custom(n,direction,asymmetric,1));assert(custom&&editing&&board.n==n);
  assert(!strcmp(before_custom,stored_game));
  for(int t=0;t<board.count;t++){
   assert(board.tiles[t].solution==asymmetric[canonical_id(board.tiles[t])]-'0');
   Vector2 mid=center(t);assert(hit(mid)==t);assert(mid.x>=0&&mid.x<view_w&&mid.y>=0&&mid.y<view_h);
  }
  game_select(2,n-1);assert(selected_axis==2&&selected_row==n-1);
  p=center(0);int old=board.tiles[0].solution;game_down(p.x,p.y,1);game_up();assert(board.tiles[0].solution==!old);
  assert(history_count==1);game_editing(0);assert(custom&&!editing&&history_count==0);
  assert(selected_axis==2&&selected_row==n-1);
  for(int t=0;t<board.count;t++)assert(board.tiles[t].state==0);
  fill_solution();assert(won);
  game_clear_effects();game_shine();assert(!shine);
  for(int tick=0;tick<2*(2*n-1);tick++){
   for(int phase=0;phase<2;phase++){
    assert(game_effects(1000+tick*500+phase*499));
    for(int t=0;t<board.count;t++){
     bool lit=2*(board.tiles[t].i+board.tiles[t].j)+board.tiles[t].o==tick%(2*n-1);
     assert(lit ? light[t]>.05f : light[t]==0);
     if(lit)assert(game_flash_stage(t)==tick);
    }
   }
  }
  game_motion(0);assert(!game_effects(20000));game_motion(1);
  game_editing(1);assert(editing&&!won&&history_count==1);
  game_undo();assert(board.tiles[0].solution==old);
  game_reset();for(int t=0;t<board.count;t++)assert(board.tiles[t].solution==0);
  game_undo();for(int t=0;t<board.count;t++)assert(board.tiles[t].solution==asymmetric[canonical_id(board.tiles[t])]-'0');
  game_orientation((direction+1)%4);assert(orientation==(direction+1)%4);
 }
 // Completion clears cross annotations; undo restores the pre-win position.
 assert(game_custom(2,0,"1000",0));
 Vector2 cross_point=center(1), winning_point=center(0);
 game_down(cross_point.x,cross_point.y,2);game_up();assert(board.tiles[1].state==2);
 game_down(winning_point.x,winning_point.y,1);game_up();assert(won);
 for(int t=0;t<board.count;t++)assert(board.tiles[t].state!=2);
 game_undo();assert(!won&&board.tiles[1].state==2&&board.tiles[0].state==0);
 // The rotation and scale pivot is the triangle centroid in every size/view.
 for(int n=2;n<=10;n++){
  memset(asymmetric,'0',n*n);asymmetric[n*n]=0;
  for(int direction=0;direction<4;direction++){
   assert(game_custom(n,direction,asymmetric,1));
   Vector2 a=vertex(0,0),b=vertex(n,0),c=vertex(0,n);
   Vector2 pivot={(a.x+b.x+c.x)/3,(a.y+b.y+c.y)/3};
   for(int phase=0;phase<=10;phase++){
    celebration_angle=36*phase;celebration_scale=1+.1f*sinf(PI*phase/10);
    Camera2D camera=celebration_camera();
    assert(camera.target.x==pivot.x&&camera.target.y==pivot.y);
    assert(camera.offset.x==pivot.x&&camera.offset.y==pivot.y);
    // A camera maps its target to its offset for every rotation and zoom.
   }
  }
 }
 game_clear_effects();
 assert(!game_custom(11,0,asymmetric,0));assert(!game_custom(2,0,"1x00",0));
 game_resume_marks("1201");assert(game_custom(2,0,"1000",0));
 assert(board.tiles[0].state==1&&board.tiles[1].state==2&&board.tiles[2].state==0&&board.tiles[3].state==1);
 game_resume_marks("99");assert(game_custom(2,0,"1000",0));assert(board.tiles[0].state==0&&board.tiles[1].state==0);
 game_resume_marks("1201");assert(!game_custom(2,0,"1x00",0));assert(game_custom(2,0,"1000",0));assert(board.tiles[0].state==0);
 game_resume_marks("1201");assert(game_custom(2,0,"1000",1));assert(board.tiles[0].state==board.tiles[0].solution);
 game_leave_custom();assert(!custom&&!editing&&level==1&&board.tiles[0].state==1);
 assert(!strcmp(before_custom,stored_game));assert(strlen(stored_game)==257);assert(strlen(stored_intro)==193);
 puts("PASS: shared custom authoring/play, every size and orientation, canonical cell IDs, hit testing, clue selection, solution matching, author undo across trial play, reset/undo, and legacy-save isolation.");
 puts("PASS: edge adjacency, finite ripple decay, missing cells, max-composed pulses, selected-only shine, reduced motion, and label clearance.");
 puts("PASS: 4/9/16-cell lessons, skip/replay, saved normal play, reset/undo, point-down geometry, A/B downwards, C left-right, hit tests, fast drag, crosses, and unchanged hover.");
}
