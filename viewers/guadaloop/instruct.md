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


Next, the IMU's should be rotated to face almost to the front but slightly to the right (the normal from the IMUs should be pointing toward the right of the camera, so we get a natural look. Then, for the storyboard elements, when you say two halves, two IMUs, the first issue here is that the storyboard doesnt stay on this element nearly long enough. It almost immediately starts going back to them tucked inside each other. I need to completely revamp this. First off, instead of just dragging one to the side, I need you to make the thigh hinge (larger) rotate towards the back and then up, almost so that it's straight on but inverted but not quite (around 160 degrees). And one thing I noticed from the later portion where you do in fact have it going about the hinge was that it's not quite rotating exactly about the center of the circular elevated portion, which is the hinge center. The pieces should both be rotating about this axis that goes through that circular plateau on one piece and the circular hole on the other. (and obviously the IMUs should stick to their respective locations relative to the brace pieces, as they currently do). Finally, the knee stick-like objects don't align through the circular rings. They should do this, as the thigh must go into the larger ring and the calf must go into the smaller ring. ensure the cylindrical bodies you made go through their respective openings. 



Alright, not bad. However, definitely needs some work. First off, why is everything sideways? Ensure that the model starts off upright (hinge should be near the top of the model, instead of near the back like it currently is.
