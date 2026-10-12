// Artificial Emotion — 28BYJ-48 grid adapter V02
// Units: mm. Experimental dimensions: check fit on actual motor.
$fn = 64;

hole_spacing = 35;
grid_spacing = 40;
m3_clearance = 3.4;
original_hole_d = 4.2; // measure on motor; nominal starting point
thickness = 2.4;
strap_width = 4.5;
outer_radius = 19.0; // approximate motor envelope; adjust after measurement
motor_clearance = 0.8;
clip_shaft_d = 3.6;
clip_head_d = 4.7; // V02: slightly stronger interference; tune for printer
clip_height = 5.0; // V02: +1.5 mm shaft engagement
clip_head_height = 1.5; // V02: +0.5 mm head, total clip +2 mm
clip_slot = 0.85;
left_pad_d = 7.0;
right_pad_d = 7.0;
// Motor mounting holes at (-17.5,0), (+17.5,0).
// Extension at x=+22.5, resulting in 40mm center distance.
left_x = -hole_spacing/2;
right_x = hole_spacing/2;
ext_x = left_x + grid_spacing;

module capsule(a,b,d){
 hull(){translate(a) circle(d=d);translate(b) circle(d=d);}
}
module planar_profile(){
 difference(){
  union(){
   // U-shaped strap above motor: two legs and an arc
   intersection(){
    difference(){
     circle(r=outer_radius + strap_width/2);
     circle(r=outer_radius - strap_width/2);
    }
    translate([-outer_radius-strap_width,0]) square([2*(outer_radius+strap_width),outer_radius+strap_width]);
   }
   capsule([left_x,0],[-outer_radius,0],strap_width);
   capsule([right_x,0],[outer_radius,0],strap_width);
   circle_at_left();
   capsule([right_x,0],[ext_x,0],strap_width);
   translate([ext_x,0]) circle(d=right_pad_d);
   translate([right_x,0]) circle(d=6.0);
  }
  translate([left_x,0]) circle(d=m3_clearance);
  translate([ext_x,0]) circle(d=m3_clearance);
 }
}
module circle_at_left(){translate([left_x,0]) circle(d=left_pad_d);}
module clip(){
 translate([right_x,0,thickness])
 difference(){
  union(){
   cylinder(h=clip_height,d=clip_shaft_d);
   translate([0,0,clip_height]) cylinder(h=clip_head_height,d1=clip_head_d,d2=clip_shaft_d);
  }
  translate([-clip_slot/2,-clip_head_d/2-1,-0.01]) cube([clip_slot,clip_head_d+2,clip_height+clip_head_height+0.03]);
 }
}
union(){linear_extrude(height=thickness) planar_profile();clip();}
