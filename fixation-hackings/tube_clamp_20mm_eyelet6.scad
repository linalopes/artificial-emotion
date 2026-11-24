// Parametric exterior collar for 20 mm round tube
// Coordinates: tube axis Z; screw faces +Y; eyelet faces -Y.
$fn=128;
tube_outer_d=20;
radial_clearance=0.35;
collar_wall=3.2;
collar_width=12;
// eyelet, in plane of collar, with hole parallel to tube axis
eye_hole_d=6;
eye_wall=4;
eye_neck_width=10;
// M2 screw radial, nut held in pocket in collar wall
m2_clearance_d=2.3;
m2_nut_across_flats=4.0;
m2_nut_depth=1.8;
// Toggle to inspect without collar
show_tube_preview=false;

inner_r=tube_outer_d/2+radial_clearance;
outer_r=inner_r+collar_wall;
eye_outer_r=eye_hole_d/2+eye_wall;
eye_y=-(outer_r+eye_outer_r-2.0);

module collar(){
 difference(){
  union(){
   // collar
   difference(){ cylinder(h=collar_width,r=outer_r,center=true); cylinder(h=collar_width+0.4,r=inner_r,center=true); }
   // robust neck and eyelet
   hull(){
     translate([0,-outer_r+1,0]) cylinder(h=collar_width,r=eye_neck_width/2,center=true);
     translate([0,eye_y,0]) cylinder(h=collar_width,r=eye_outer_r,center=true);
   }
  }
  // Full circular bore; no internal protrusions.
  cylinder(h=collar_width+2,r=inner_r,center=true);
  // eyelet through-hole parallel to tube
  translate([0,eye_y,0]) cylinder(h=collar_width+1,r=eye_hole_d/2,center=true);
  // radial M2 through-hole, located at center of width, along Y
  translate([0,inner_r-1,0]) rotate([-90,0,0]) cylinder(h=collar_wall+4,d=m2_clearance_d);
  // Hexagonal captive nut pocket, entered from interior-facing collar surface
  translate([0,inner_r-0.4,0]) rotate([-90,0,0]) rotate([0,0,30]) cylinder(h=m2_nut_depth+0.4,d=m2_nut_across_flats/cos(30),$fn=6);
 }
}
collar();
if(show_tube_preview) %cylinder(h=30,d=tube_outer_d,center=true);
