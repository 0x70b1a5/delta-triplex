#ifndef GENERATOR_H
#define GENERATOR_H
#include "puzzle.h"
#include <stdint.h>
typedef struct { int solved, rounds, initial; } Deduction;
Deduction puzzle_deduce(const Board *board);
// Stable IDs: Easy=0, Medium=1, Hard=2, Impossible=3, Sprout=4.
// One bounded attempt; success certifies a unique solution by line deduction.
bool puzzle_generate(int difficulty,uint32_t seed,Board *output,Deduction *rating);
#endif
