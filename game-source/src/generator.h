#ifndef GENERATOR_H
#define GENERATOR_H
#include "puzzle.h"
#include <stdint.h>
typedef struct { int solved, rounds, initial; } Deduction;
Deduction puzzle_deduce(const Board *board);
// One bounded attempt; success certifies a unique solution by line deduction.
bool puzzle_generate(int difficulty,uint32_t seed,Board *output,Deduction *rating);
#endif
