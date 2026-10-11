// Artificial Emotion / MITTZON tube saddle v0.4 — OS20, shortened U by 6 mm grid, M3
// Units mm. Print on broad flat side; no supports.
$fn=96;
tube_diameter=25;
clearance=0.6;
wall=4;
strap_width=18;
foot_thickness=4;
foot_reach=56;
corner_radius=1.8; // rounding of the four external tab corners
hole_diameter=3.4;
hole_positions=[30,50]; // 20 mm between holes on each tab; 60 mm across inner pair
r=(tube_diameter+clearance)/2;
outer=r+wall;
cy=11; // reduced from 17 mm: 6 mm shorter U legs
module rounded_tabs(){
  hull() for (x=[-foot_reach+corner_radius,foot_reach-corner_radius], y=[corner_radius,foot_thickness-corner_radius])
    translate([x,y]) circle(r=corner_radius);
}
module section(){
 difference(){
  union(){
   // semicircular arch, vertical legs, and extended mounting wings
   intersection(){translate([0,cy]) circle(r=outer);translate([-outer,cy]) square([2*outer,outer+0.1]);}
   translate([-outer,foot_thickness]) square([2*outer,cy-foot_thickness]);
   rounded_tabs();
  }
  // inner clearance through bottom, then circular crown
  translate([-r,-1]) square([2*r,cy+1]);
  translate([0,cy]) circle(r=r);
 }
}
difference(){
 linear_extrude(height=strap_width) section();
 for(s=[-1,1],p=hole_positions)
  translate([s*p,foot_thickness/2,strap_width/2])
   rotate([90,0,0]) cylinder(h=foot_thickness+2,d=hole_diameter,center=true);
}
