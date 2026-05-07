# Protein score fixtures

These fixtures make the barcode/amino-acid-score regression tests database independent.

- `o13297_reference_aa_scores.tsv` is the O13297 subset extracted from the R-computed reference file `aa_scores_1_osmo_lip_vs_ctr_lip.tsv`.
- `o13297_reference_score_input.tsv` is a compact input fixture derived from contiguous equal-score runs in the reference output. It uses `adj_pval = 1`, so additive scoring gives `-log10(1) + abs(diff) = diff`, exactly reproducing the R-computed amino-acid scores while still exercising inclusive residue expansion, averaging, normalization, and the additive/multiplicative method switch.
- `o13297_sequence.txt` is the O13297 sequence captured from the database once so tests do not query the database.
