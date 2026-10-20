// V08 — V07 suspension ring with HEXAGONAL M2 nut trap
// No pulley bracket. All dimensions mm.
$fn=120;
tube_d=25;
radial_clearance=0.35;
ring_wall=3.2;
axial_width=12;
key_width=4.15;
key_depth=3.0;
m2_clearance=2.3;
m2_access_d=5.0;
m2_nut_af=4.0; // across flats
m2_nut_depth=1.8; // recessed from key inner face
eye_hole_d=6;
eye_outer_d=15;
eye_center_y=38;
post_x=9.0;
post_width=5.0;
post_top_y=28;
post_anchor_y=12.5;
inner_r=tube_d/2+radial_clearance;
outer_r=inner_r+ring_wall;
module ring(){difference(){cylinder(h=axial_width,r=outer_r,center=true);cylinder(h=axial_width+2,r=inner_r,center=true);}}
module assembly(){union(){
 ring();
 translate([0,inner_r-key_depth/2,0]) cube([key_width,key_depth+0.9,axial_width],center=true);
 difference(){
 union(){
 // Posts anchored well inside the ring wall, not just touching the tangent
 for(s=[-1,1]) hull(){
  translate([s*post_x,post_anchor_y,0]) cube([post_width,4.5,axial_width],center=true);
  translate([s*post_x,post_top_y,0]) cube([post_width,3,axial_width],center=true);
 }
 // Upper bridge and hanging eye
 hull(){
  translate([-post_x,post_top_y,0])cube([post_width,3,axial_width],center=true);
  translate([post_x,post_top_y,0])cube([post_width,3,axial_width],center=true);
  translate([0,eye_center_y,0])cylinder(h=axial_width,r=eye_outer_d/2,center=true);
 }
 }
 // Cut the entire tube clearance from the upper structure, never from the original key.
 cylinder(h=axial_width+2,r=inner_r,center=true);
 }
}}
difference(){
 assembly();
 // Eye bore, through axial direction
 translate([0,eye_center_y,0])cylinder(h=axial_width+2,d=eye_hole_d,center=true);
 // M2 radial bore in the original top key
 translate([0,inner_r-2,0])rotate([90,0,0])cylinder(h=20,d=m2_clearance,center=true);
 // Hexagonal M2 nut pocket, opening on the inward face of the key.
 // Its flat-to-flat dimension is m2_nut_af, NOT a circular recess.
 // Key inner face = inner_r-key_depth-0.45
 translate([0,inner_r-key_depth-0.45 + m2_nut_depth/2 - 0.01,0])
   rotate([90,0,0])
     cylinder(h=m2_nut_depth+0.02,r=m2_nut_af/sqrt(3),$fn=6,center=true);
 // Tool access ONLY from above key up to window, stops before upper bridge
 translate([0,20.8,0])rotate([90,0,0])cylinder(h=13.0,d=m2_access_d,center=true);
}
