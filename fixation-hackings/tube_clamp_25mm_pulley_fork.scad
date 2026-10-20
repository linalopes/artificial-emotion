// V06 FDM: based on validated V04. ONLY the cheek profile is changed.
// Print with the ring's flat circular face on the bed (Z = -6).
// Tube axis Z; fork points toward -Y; cheeks are separated along X.
$fn=128;
tube_outer_d=25;
radial_clearance=0.35;
collar_wall=3.2;
collar_width=12;
slot_opening=4.5;
tongue_clearance=0.35;
tongue_depth=3;
m2_clearance_d=2.3;
m2_nut_across_flats=4;
m2_nut_depth=1.8;
fork_gap=5;
fork_cheek_thickness=3.5;
fork_length=20;
fork_axial_width=12;
fork_hole_d=3.2;
fork_axle_from_collar=12;
// Rounded tip in XY only, NOT a tapered Z cross-section.
fork_tip_rounding=1.7;
inner_r=tube_outer_d/2+radial_clearance;
outer_r=inner_r+collar_wall;

module cheek(x0){
  // Constant 12 mm thickness in Z, so no unsupported tapered bottom edge.
  // 2D outline: straight sides and rounded end in the plane of the bed.
  translate([0,0,-fork_axial_width/2])
  linear_extrude(height=fork_axial_width)
  hull(){
    translate([x0,-outer_r+1.0]) square([fork_cheek_thickness,1.5]);
    translate([x0+fork_cheek_thickness/2,-outer_r-fork_length+fork_tip_rounding])
      circle(r=min(fork_tip_rounding,fork_cheek_thickness/2));
  }
}
module clamp(){
 difference(){
  union(){
   difference(){cylinder(h=collar_width,r=outer_r,center=true);cylinder(h=collar_width+0.4,r=inner_r,center=true);}
   translate([-(slot_opening-tongue_clearance)/2,inner_r-tongue_depth,-collar_width/2]) cube([slot_opening-tongue_clearance,tongue_depth+0.6,collar_width]);
   cheek(-fork_gap/2-fork_cheek_thickness);
   cheek(fork_gap/2);
  }
  // Preserve clear bore below; top tongue remains as in V04.
  intersection(){
   cylinder(h=collar_width+2,r=inner_r,center=true);
   translate([-inner_r-1,-inner_r-1,-collar_width/2-1]) cube([2*inner_r+2,inner_r+1,collar_width+2]);
  }
  translate([0,-outer_r-fork_axle_from_collar,0]) rotate([0,90,0]) cylinder(h=fork_gap+2*fork_cheek_thickness+2,d=fork_hole_d,center=true);
  translate([0,inner_r-tongue_depth-1,0]) rotate([-90,0,0]) cylinder(h=collar_wall+tongue_depth+4,d=m2_clearance_d);
  translate([0,inner_r-tongue_depth-0.01,0]) rotate([-90,0,0]) rotate([0,0,30]) cylinder(h=m2_nut_depth+0.01,d=m2_nut_across_flats/cos(30),$fn=6);
 }
}
clamp();
