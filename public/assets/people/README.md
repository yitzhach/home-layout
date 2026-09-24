Cut-out figures for Layout -> People, one picture per figure kind:

    woman.png   man.png

Each is a PNG with a transparent background, supplied by the owner. The
figure's own extent inside the picture — its box, in pixels — is recorded in
`PEOPLE` in `src/people.js`; replacing a picture means measuring the new one's
box off its alpha channel and updating that entry, or the figure will stand
at the wrong height or float above the floor.

The app runs without them: a kind whose picture is missing is drawn as the
stylised grey mannequin.
