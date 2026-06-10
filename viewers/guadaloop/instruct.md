Start with "Guadaloop Testrig" like now, but with the Testrig in only white outline, like my last name on the front page.
Have this title higher up on the screen, not centered, so the actual model doesn't prevent a viewer from reading the actual title as much. There should definitely still be some sort of overlap... just for aesthetics, but it needs to be visible.

Next, as the viewer scrolls, the current fade animation should still happen, but at the same time the model should go to the left of the screen, while the title of Levitation yoke shrinks and goes to the right half on top, with a blurb at the bottom. When this happens, the coils should also turn translucent, while the yoke cores stay opaque. As the user scrolls, the angle of the camera can swing around to be head-on with the yoke along with dimensions if possible, and a new blurb can appear.

Then, the view can go to top-down, and a final blurb can appear, then we go back to the full assembly with the current opacity settings briefly with NO TITLE (not "full assembly")

Then we do something similar for sensors, but instead of those views we can do just the isometric (view 1), isometric with translucent plastic holder pieces, and then top-down (view 3) with dimensions.

Finally, do something similar for the slide rails, turning the track interface pieces translucent for the first (isometric) view, then making those opaque and bringing in the track piece translucently, then making that opaque then bringing in the rest of the full assembly and making the entire chassis as well as the lower sliders move up with trapezoidal motion profile, then down with the same profile (so it should be smooth both ways), before hitting the end.

Each of these stages should, once again, be accompanied by a placeholder blurb for now.

Oh one more thing is that at the beginning when the user scrolls up, the title should scroll up while the current animation runs. Everything else should be left visually unchanged, but the "Guadaloop Testrig Scroll To Explore" title should scroll up out of frame rather than fading out.

Then, update the thumbnail on the main page to include the image at @UsefulCrop.png. No need for the "live 3d" tag, maybe at the most one of those subtle cube 3D labels on the bottom corner of the thumbnail.

Then, Look through all the folders that now have .glb files and try to replicate this layout in those respective projects (if they exist). If not, don't worry about adding them. This should leave just the blindmaster project, the rescuevision project, and the smartPT project to take care of. They should get a similar index.html card as the guadaloop testrig (row-wide) with the thumbnail for rescuevision being @groupPic.gif, for smartPT being @stagePic.jpeg, and for BlindMaster being the logo icon in @BlindMaster/blinds_flutter. Let me know what your thoughts are about this choice of thumbnail. Is it not effective?

Then, for the storyboard elements, when you say "two halves, two IMUs," I need to completely revamp this. First off, instead of just dragging one to the side, I need you to make the thigh (upper leg) brace piece rotate towards the back and then up (all about the hinge axis, similar to the start of the current "Tracking the angle" animation but moving the upper leg rather than lower), almost so that it's straight on but inverted but not quite (around 160 degrees). Once these changes are made, the storyboard should stay here and just bring in the leg visualization objects before starting another small back-and-forth hinge animation with them for the actual "Tracking the angle" segment, similar to what's currently there but again with upper leg movement rather than lower. The leg silhouettes don't currently always align through the circular rings throughout the animation once they appear, though. It seems like the stationary leg is pointing the other way. I'm sure you can see this. ensure the cylindrical bodies you made go through their respective openings. there might be an underlying issue here regarding how those angles are calculated...

Alright, not bad. However, definitely needs some work. First off, why is everything sideways? Ensure that the model starts off upright (hinge should be near the top of the model, instead of near the back like it currently is.
