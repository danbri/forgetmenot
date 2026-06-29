#!/usr/bin/env python3
"""Canonicalise Jena ARQ algebra (SSE) read on stdin so that meaning-preserving
cleanups compare equal.

It (1) drops the `(prefix ((..map..)) BODY)` wrapper, (2) expands every prefixed
name in the body to an absolute <IRI>, and (3) re-serialises with deterministic
spacing. The result is insensitive to: comments, whitespace, keyword case,
unused PREFIX declarations, and the *choice* of prefix label for a namespace.

It is deliberately NOT insensitive to things that change meaning — variable
names (incl. case), triple/operator structure, projection, ORDER/DISTINCT, etc.
"""
import sys

def tokenize(s):
    toks, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c.isspace():
            i += 1
        elif c in '()':
            toks.append(c); i += 1
        elif c == '<':                      # absolute IRI <...>
            j = s.find('>', i)
            if j < 0: toks.append(s[i:]); break
            toks.append(s[i:j+1]); i = j+1
        elif c == '"':                      # literal, plus optional @lang / ^^<dt>
            j = i+1
            while j < n and s[j] != '"':
                j += 2 if s[j] == '\\' else 1
            j += 1
            if s[i:j].endswith('"') and j < n and s[j] == '@':
                while j < n and not s[j].isspace() and s[j] not in '()': j += 1
            elif j+1 < n and s[j:j+2] == '^^':
                j += 2
                if j < n and s[j] == '<': j = s.find('>', j)+1
            toks.append(s[i:j]); i = j
        else:                               # bare atom (keyword, var, pname, number)
            j = i
            while j < n and not s[j].isspace() and s[j] not in '()"<':
                j += 1
            toks.append(s[i:j]); i = j
    return toks

def parse(toks):
    it = iter(toks)
    def rd(tok):
        if tok == '(':
            lst = []
            for t in it:
                if t == ')': return lst
                lst.append(rd(t))
            return lst
        return tok
    out = []
    for t in it:
        out.append(rd(t))
    return out[0] if len(out) == 1 else out

def expand_atom(a, pm):
    if not isinstance(a, str): return a
    if a[:1] in '?<"' or a == '(': return a
    if ':' in a:
        label, _, local = a.partition(':')
        if label in pm:                     # known prefix → absolute IRI
            return '<' + pm[label] + local + '>'
    return a

def walk(node, pm):
    if isinstance(node, list):
        return [walk(x, pm) for x in node]
    return expand_atom(node, pm)

def serialize(node):
    if isinstance(node, list):
        return '(' + ' '.join(serialize(x) for x in node) + ')'
    return node

def main():
    text = sys.stdin.read().strip()
    if not text:
        print(''); return
    tree = parse(tokenize(text))
    pm = {}
    body = tree
    if isinstance(tree, list) and tree and tree[0] == 'prefix':
        # tree == ['prefix', [ [label,iri], ... ], BODY ]
        for entry in tree[1]:
            if isinstance(entry, list) and len(entry) == 2:
                label = entry[0][:-1] if entry[0].endswith(':') else entry[0]
                iri = entry[1][1:-1] if entry[1].startswith('<') else entry[1]
                pm[label] = iri
        body = tree[2]
    print(serialize(walk(body, pm)))

if __name__ == '__main__':
    main()
