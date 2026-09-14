Bookshelf shelf layout update

Implemented:
- Compact family (800 x 350 x 2150 mm): 9 shelves total including the bottom shelf.
- Tall family (900 x 350 x 2300 mm): also 9 shelves total including the bottom shelf.
- Shelves 1 through 8 share the exact same vertical center heights in both families.
- Shelf 9 is moved upward only in the tall family by the family height delta.
- The gap above shelf 9 remains equal between compact and tall families.

Technical note:
- The compact family now acts as the baseline layout template.
- The tall family reuses the first 8 compact shelf positions and offsets only the 9th shelf by +150 mm.
