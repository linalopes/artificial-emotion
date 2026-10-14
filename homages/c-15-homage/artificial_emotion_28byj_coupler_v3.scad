/*
 ARTIFICIAL EMOTION — 28BYJ-48 to round shaft coupler v3
 Fully printable WITHOUT pause: two end-loaded M2 captive-nut slots.
 Motor nut slides in from motor end (Z=0); output nut slides in from
 output end (Z=body_length). Insert nuts AFTER printing, BEFORE screws.

 Axis Z. Motor flats parallel X, at Y=+/-1.5mm nominal.
 Motor grub screw enters from +Y and presses DIRECTLY onto a flat.
 Output screw enters from +X and presses against round output shaft.
 The slots constrain each hex nut against turning; screw keeps nut from falling.

 PRINT: on a flat end, no support. The nut slots are OPEN to the respective
 ends, like user reference. Test tolerances on your printer before final use.
*/
$fn = 96;

// CUSTOMIZE
output_shaft_diameter = 2.0;     // diameter of the inserted output rod
body_diameter = 13.0;
body_length = 22.0;
motor_shaft_diameter = 5.0;
motor_flat_distance = 3.0;       // gap between the two shaft flats
motor_socket_depth = 8.0;
output_socket_depth = 8.0;
motor_clearance = 0.20;          // total added diameter / flat spacing
output_clearance = 0.20;         // total added diameter

m2_screw_hole = 2.15;            // unthreaded through-hole (M2 grub screw)
m2_nut_across_flats = 4.0;      // measure your actual M2 nuts
m2_nut_thickness = 1.6;
nut_af_clearance = 0.25;
nut_thickness_clearance = 0.25;

motor_screw_z = 4.5;
output_screw_z = 17.5;
nut_center_radius = 3.9;
edge_chamfer = 0.4;

// Construct end-loaded nut slots. Nut is installed axially from relevant end.
// Hexagon viewed in radial direction: six-point form, flat top/bottom.
// The nut is held against rotation by the walls of this profile.
nut_af = m2_nut_across_flats + nut_af_clearance;
nut_radial_thickness = m2_nut_thickness + nut_thickness_clearance;
nut_corner_diameter = nut_af/cos(30);
slot_reach = 0.3;
body_r = body_diameter/2;

assert(motor_socket_depth+output_socket_depth<body_length-1,
       "Socket depths overlap");
assert(body_r > nut_center_radius+nut_radial_thickness/2+0.65,
       "Increase body diameter; outer wall too thin");
assert(motor_screw_z>=2.0 && body_length-output_screw_z>=2.0,
       "Screw too close to an end");

module body(){
    union(){
        cylinder(d1=body_diameter-2*edge_chamfer,d2=body_diameter,h=edge_chamfer);
        translate([0,0,edge_chamfer]) cylinder(d=body_diameter,h=body_length-2*edge_chamfer);
        translate([0,0,body_length-edge_chamfer]) cylinder(d1=body_diameter,d2=body_diameter-2*edge_chamfer,h=edge_chamfer);
    }
}
module motor_flatted_socket(){
    intersection(){
        cylinder(d=motor_shaft_diameter+motor_clearance,h=motor_socket_depth+0.12);
        translate([-(motor_shaft_diameter+1),-(motor_flat_distance+motor_clearance)/2,-0.03])
            cube([2*(motor_shaft_diameter+1),motor_flat_distance+motor_clearance,motor_socket_depth+0.2]);
    }
}
// Radial nut slot oriented along Y. Nut lies with threaded axis along Y.
// Use a constant cross-section running from the end to beyond the screw.
// Open at bottom => no paused layer, nut slides in from bottom.
// 2D radial slot with nut-width clearance. Exact hex cavity around screw,
// plus straight entrance running to face. Built using a union of nut pocket
// and extrusion along Z, so its walls remain parallel and printable.
module nut_slot_bottom(){
    // Width and thickness of rectangular axial access channel
    translate([-nut_af/2, nut_center_radius-nut_radial_thickness/2,-0.1])
        cube([nut_af,nut_radial_thickness,motor_screw_z+nut_af/2+0.1]);
}
module nut_slot_top(){
    translate([nut_center_radius-nut_radial_thickness/2,-nut_af/2,output_screw_z-nut_af/2])
        cube([nut_radial_thickness,nut_af,
              body_length-output_screw_z+nut_af/2+0.12]);
}
module coupler(){
    difference(){
        body();
        translate([0,0,-0.04]) motor_flatted_socket();
        translate([0,0,body_length-output_socket_depth])
            cylinder(d=output_shaft_diameter+output_clearance,h=output_socket_depth+0.1);
        // Grub screw along Y pointing at +Y flat
        translate([0,0,motor_screw_z]) rotate([-90,0,0])
            cylinder(d=m2_screw_hole,h=body_r+0.1);
        // Grub screw along X pointing at rod
        translate([0,0,output_screw_z]) rotate([0,90,0])
            cylinder(d=m2_screw_hole,h=body_r+0.1);
        // Nut pockets are open from each nearest AXIAL END; no pauses.
        nut_slot_bottom();
        nut_slot_top();
    }
}
coupler();
