// OS20 SG90 vertical mount v1. Units: mm.
// Nominal SG90 dimensions; verify actual tab pitch and body depth below tabs.
$fn=64;
pitch=20;
base_x=50; base_y=30; base_z=4;
base_hole=3.2;
servo_pitch=27;
body_x=23.5; // clear opening between supports
pedestal_h=20;
pedestal_y=14;
pedestal_outer_x=17; // outer edge measured from center
pilot_d=1.6; pilot_depth=6;
corner_r=3;
cable_slot_y=7; cable_slot_h=9;
// Cable exits along +X, through the lower part of the right support.
module rounded_base(){
  hull() for(x=[-1,1],y=[-1,1])
    translate([x*(base_x/2-corner_r),y*(base_y/2-corner_r),0]) cylinder(r=corner_r,h=base_z);
}
module pedestal(side){
  translate([side*(body_x/2+pedestal_outer_x)/2,0,base_z+pedestal_h/2-0.05])
    cube([pedestal_outer_x-body_x/2,pedestal_y,pedestal_h+0.1],center=true);
}
difference(){
 union(){ rounded_base(); pedestal(-1); pedestal(1); }
 for(x=[-pitch,pitch],y=[-pitch/2,pitch/2])
   translate([x,y,-1]) cylinder(d=base_hole,h=base_z+2);
 for(x=[-servo_pitch/2,servo_pitch/2])
   translate([x,0,base_z+pedestal_h-pilot_depth]) cylinder(d=pilot_d,h=pilot_depth+1);
 // Open-ended cable tunnel; short bridge over 7 mm opening.
 translate([body_x/2-0.2,-cable_slot_y/2,base_z-0.01])
   cube([pedestal_outer_x-body_x/2+0.4,cable_slot_y,cable_slot_h]);
}
