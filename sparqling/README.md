# SPARQL cleanup methodology

> **Status:** draft scaffold. The instructions below are captured verbatim from
> the task brief; the marked `TODO` slots (example query pairs, the input query
> to clean up) still need to be filled in by a human. Don't treat the empty
> slots as done.

## The task

Here are 5 pairs of SPARQL queries we have been tidying up and documenting.

<!-- TODO (humans): paste the 5 before/after example pairs here. -->

1. **Pair 1**
   - _Before:_
     ```sparql
     -- TODO: messy input query
     ```
   - _After:_
     ```sparql
     -- TODO: cleaned query
     ```
   - _Notes:_ <!-- what changed and why -->

2. **Pair 2**
   - _Before:_
     ```sparql
     -- TODO
     ```
   - _After:_
     ```sparql
     -- TODO
     ```
   - _Notes:_

3. **Pair 3**
   - _Before:_
     ```sparql
     -- TODO
     ```
   - _After:_
     ```sparql
     -- TODO
     ```
   - _Notes:_

4. **Pair 4**
   - _Before:_
     ```sparql
     -- TODO
     ```
   - _After:_
     ```sparql
     -- TODO
     ```
   - _Notes:_

5. **Pair 5**
   - _Before:_
     ```sparql
     -- TODO
     ```
   - _After:_
     ```sparql
     -- TODO
     ```
   - _Notes:_

Please study our changes and then describe in specific detail the methodology
someone should apply for improving a similar input query. **It is critical that
the formal meaning of the query be unchanged.** The result of this is a
one-pager markdown text encapsulation of the SPARQL cleanup methodology.

<!-- TODO: the derived one-page methodology goes here (or in METHODOLOGY.md). -->

## Apply it

Apply this methodology to the following messy query:

```sparql
-- TODO (humans): add the input query to clean up here.
```

## Validate

To validate our work, provide a simple bash CLI script that downloads Apache
Jena ARQ and uses its SPARQL parser to check a pair of queries, as well as
optionally testing their behaviour and results on a specified endpoint URI.

<!-- TODO: the validation script (or a pointer to it, e.g. validate.sh) goes here. -->
