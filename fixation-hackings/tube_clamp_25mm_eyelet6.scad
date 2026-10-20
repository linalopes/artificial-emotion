// Parametric exterior collar for 25 mm awning tube
// Coordinates: tube axis Z; slot faces +Y; eyelet faces -Y.
$fn=128;
tube_outer_d=25;
radial_clearance=0.35;
collar_wall=3.2;
collar_width=12;
slot_opening=4.5;
tongue_clearance=0.35;
tongue_depth=3.0;
// eyelet, in plane of collar, with hole parallel to tube axis
eye_hole_d=6;
eye_wall=4;
eye_neck_width=10;
// M2 screw radial, nut held in pocket in tongue
m2_clearance_d=2.3;
m2_nut_across_flats=4.0;
m2_nut_depth=1.8;
// Toggle to inspect without collar
show_tube_preview=false;

inner_r=tube_outer_d/2+radial_clearance;
outer_r=inner_r+collar_wall;
tongue_w=slot_opening-tongue_clearance;
eye_outer_r=eye_hole_d/2+eye_wall;
eye_y=-(outer_r+eye_outer_r-2.0);

module collar(){
 difference(){
  union(){
   // collar
   difference(){ cylinder(h=collar_width,r=outer_r,center=true); cylinder(h=collar_width+0.4,r=inner_r,center=true); }
   // antirotation tongue projecting into longitudinal slit
   translate([-tongue_w/2,inner_r-tongue_depth,-collar_width/2]) cube([tongue_w,tongue_depth+0.6,collar_width]);
   // robust neck and eyelet
   hull(){
     translate([0,-outer_r+1,0]) cylinder(h=collar_width,r=eye_neck_width/2,center=true);
     translate([0,eye_y,0]) cylinder(h=collar_width,r=eye_outer_r,center=true);
   }
  }
  // Keep the entire lower inner bore clear of eyelet/neck material.
  // Upper half is excluded to preserve the anti-rotation tongue.
  intersection(){
    cylinder(h=collar_width+2,r=inner_r,center=true);
    translate([-inner_r-1,-inner_r-1,-collar_width/2-1]) cube([2*inner_r+2,inner_r+1,collar_width+2]);
  }
  // eyelet through-hole parallel to tube
  translate([0,eye_y,0]) cylinder(h=collar_width+1,r=eye_hole_d/2,center=true);
  // radial M2 through-hole, located at center of width, along Y
  translate([0,inner_r-tongue_depth-1,0]) rotate([-90,0,0]) cylinder(h=collar_wall+tongue_depth+4,d=m2_clearance_d);
  // Hexagonal captive nut pocket, entered from interior-facing tongue surface
  translate([0,inner_r-tongue_depth-0.01,0]) rotate([-90,0,0]) rotate([0,0,30]) cylinder(h=m2_nut_depth+0.01,d=m2_nut_across_flats/cos(30),$fn=6);
 }
}
collar();
if(show_tube_preview) %difference(){cylinder(h=30,d=tube_outer_d,center=true);cylinder(h=31,d=tube_outer_d-2,center=true);translate([-slot_opening/2,0,-16])cube([slot_opening,20,32]);}
