# public/

Static assets served at the root URL path.

## favicon.ico

`favicon.ico` should be generated from `favicon.svg`. You can do this with:

```
npx sharp-cli --input favicon.svg --output favicon.ico resize 32 32
```

Or use any SVG-to-ICO converter. The SVG is the source of truth.
