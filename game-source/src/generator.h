#ifndef GENERATOR_H
#define GENERATOR_H
#include "puzzle.h"
#include <stdint.h>
typedef struct { int solved, rounds, initial; } Deduction;
Deduction puzzle_deduce(const Board *board);
// Stable IDs: Easy=0, Medium=1, Hard=2, Impossible=3, Sprout=4.
// One bounded attempt; success certifies a unique solution by line deduction.
bool puzzle_generate(int difficulty,uint32_t seed,Board *output,Deduction *rating);
// Endless puzzle `number` (1-based) of a difficulty is the same for every player.
// Sprout and Easy shuffle every board the generator can accept, so they are finite
// and never repeat; the larger sizes derive seeds from the number and are unbounded.
int endless_count(int difficulty); // 0 when unbounded
bool endless_puzzle(int difficulty,int number,Board *output,Deduction *rating);
#endif
