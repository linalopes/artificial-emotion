// PVC square tube LED flat aluminium strip terminal - V2
// Lina Lopes / prototype, 2026-10-29
// Units: mm. Export modes: "layout", "cap", "clip", "assembled".
// NO SUPPORTS: export cap and clip separately, in their modeled orientations.
$fn=40;
mode="layout";

// PVC profile: OD 12 x 12, ID nominal 8 x 8.
cap_size=12.4;      // 0.2 mm lip per side
cap_thick=2.0;
insert_width=8.0;   // nominal press fit; tested V1 at 7.8 was too loose
insert_length=9;
insert_lead=0.6;
// Mechanical link: square peg and through-opening
socket_width=3.25;
peg_width=3.0;
peg_length=6.0;
// Flexible C jaw for flat aluminum strip 3 wide x 1 thick
clip_z=7.0;         // longer C jaw for much better stability
mouth_width=2.8;    // narrow snap entrance across 3 mm strip width
cavity_width=3.25;
cavity_depth=3.35;  // aluminium (1 mm) + COB (2 mm) + clearance
back_thickness=1.65;
arm_thickness=1.35;

module cap(){
  // Exposed cap face at z=0. Print with this face on build plate.
  difference(){
    union(){
      translate([-cap_size/2,-cap_size/2,0]) cube([cap_size,cap_size,cap_thick]);
      // pin standing on the cap, no overhangs
      translate([-insert_width/2,-insert_width/2,cap_thick])
        cube([insert_width,insert_width,insert_length-insert_lead]);
      // chamfered lead-in on pin
      translate([0,0,cap_thick+insert_length-insert_lead])
        linear_extrude(height=insert_lead,scale=(insert_width-0.7)/insert_width)
           square([insert_width,insert_width],center=true);
    }
    // unobstructed through-hole for clip peg; vertical means no supports
    translate([-socket_width/2,-socket_width/2,-0.1])
       cube([socket_width,socket_width,cap_thick+insert_length+0.2]);
  }
}

// Clip is printed with its open C face on the bed, square pin growing upward.
// The larger C grips the WHOLE stack (aluminum + COB) with no pinching on the adhesive interface.
// Coordinates: mouth facing +Y, capturing strip oriented along X, its
// 3 mm width between +/- cavity_width/2, and 3 mm combined thickness in Y.
module clip_profile(){
  union(){
    // peg footprint reinforced by a central mounting base
    square([7,7],center=true);
    // neck carries the C away from the cap centre
    translate([-2,2.2]) square([4,5.8]);
    // C pocket: longer, deep enough for aluminum + COB.
    // curved corners are not required for a first functional print
    difference(){
      translate([-cavity_width/2-arm_thickness,6.3])
         square([cavity_width+2*arm_thickness,6.5]);
      // Pocket 3.25 mm wide by 3.35 mm deep; snap opening 2.8 mm wide.
      translate([-cavity_width/2,7.95]) square([cavity_width,cavity_depth]);
      translate([-mouth_width/2,7.95+cavity_depth]) square([mouth_width,2]);
    }
  }
}

module clip(){
  union(){
    linear_extrude(height=clip_z) clip_profile();
    translate([0,0,clip_z])
       linear_extrude(height=peg_length)
          square([peg_width,peg_width],center=true);
  }
}

if (mode=="cap") cap();
else if(mode=="clip") clip();
else if(mode=="assembled"){
  color("ivory") cap();
  // face of cap at z=0; clip peg enters upwards from below
  color("lightsteelblue") translate([0,0,-clip_z]) clip();
}
else {
  cap();
  translate([24,0,0]) clip();
}
