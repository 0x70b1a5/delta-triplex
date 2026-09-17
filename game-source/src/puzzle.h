#ifndef PUZZLE_H
#define PUZZLE_H
#include <stdbool.h>
#define MAX_N 10
#define MAX_TILES (MAX_N*MAX_N)
#define MAX_LINE (2*MAX_N-1)
typedef struct { int i,j,o; bool active; int solution,state; } Tile;
typedef struct { int tile[MAX_LINE],count,clue[MAX_LINE],clue_count; } Line;
typedef struct { int n,count; Tile tiles[MAX_TILES]; Line lines[3][MAX_N]; } Board;
void board_init(Board *b,int n,const char *pattern);
void board_rebuild_lines(Board *b);
int tile_line(const Board *b,int tile,int axis);
bool line_matches(const Board *b,const Line *line);
bool board_solved(const Board *b);
#endif
