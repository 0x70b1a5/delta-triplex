RAYLIB ?= ../.build/raylib-5.5
EMCC ?= emcc
CC ?= cc
CFLAGS = -std=c99 -Wall -Wextra -O2
ifeq ($(shell uname -s),Darwin)
TEST_LDFLAGS = -Wl,-dead_strip
else
TEST_LDFLAGS = -Wl,--gc-sections
endif

.PHONY: web desktop test clean
web:
	python3 build_shell.py
	mkdir -p web
	$(EMCC) $(CFLAGS) src/main.c src/puzzle.c src/generator.c -I$(RAYLIB)/src $(RAYLIB)/src/libraylib.a -o web/index.html -sUSE_GLFW=3 -sALLOW_MEMORY_GROWTH=1 -sSINGLE_FILE=1 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=ccall -sEXPORTED_FUNCTIONS=_main,_malloc,_free --shell-file build/shell.html

desktop:
	mkdir -p build
	$(CC) $(CFLAGS) src/main.c src/puzzle.c src/generator.c $$(pkg-config --cflags --libs raylib) -lm -o build/tri-logic

test:
	mkdir -p build
	$(CC) $(CFLAGS) src/test_puzzle.c src/puzzle.c -o build/test-puzzle
	./build/test-puzzle
	python3 generate_puzzles.py

clean:
	rm -rf build web/index.html

# Native integration test; retains only raylib's collision function.
test-game:
	mkdir -p build
	$(CC) $(CFLAGS) -ffunction-sections -fdata-sections -I$(RAYLIB)/src -c $(RAYLIB)/src/rshapes.c -o build/rshapes-test.o
	$(CC) $(CFLAGS) -ffunction-sections -fdata-sections -I$(RAYLIB)/src src/test_geometry.c src/puzzle.c src/generator.c build/rshapes-test.o $(TEST_LDFLAGS) -lm -o build/test-game
	./build/test-game

.PHONY: test-generator
test-generator:
	mkdir -p build
	$(CC) $(CFLAGS) src/test_generator.c src/puzzle.c src/generator.c -o build/test-generator
	./build/test-generator
