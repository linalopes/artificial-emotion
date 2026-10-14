/*
 Artificial Emotion — 28BYJ-48 flange adapter v1
 Units: mm. One-piece FDM print; NO pause required.

 Motor enters from underside (Z=0), flanged face at Z=hub_height+flange_thickness.
 Shaft socket: true double-flat cross section (Ø5 and 3 mm between flats).
 M2 grub screw is perpendicular to the +Y flat. Ordinary M2 hex nut slips
 into a bottom-open captive pocket AFTER printing, then the M2 screw threads
 radially through it, pressing the motor's flat.

 Print with flange ON THE BED (top surface down), hub pointing upwards.
 Nut slot and motor socket face upwards; supports usually unnecessary.
 Four M2 clearance holes on a parametrized bolt circle.
*/
$fn = 120;

// ---- MOTOR INTERFACE ----
motor_shaft_diameter = 5.0;
motor_flat_distance = 3.0;
motor_socket_depth = 8.0;
motor_fit_clearance = 0.20;  // total diametric / across-flats clearance

// ---- FLANGE ----
hub_diameter = 13.0;
hub_height = 11.0;
flange_diameter = 28.0;
flange_thickness = 3.0;
bolt_circle_diameter = 20.0;
flange_holes = 4;
flange_hole_diameter = 2.3; // M2 clearance, adjust to preference
bolt_angle_offset = 45;     // holes at diagonal quadrants

// ---- GRUB SCREW + POST-PRINT NUT ----
m2_screw_clearance = 2.15;
m2_nut_across_flats = 4.0; // check with calipers
m2_nut_thickness = 1.6;    // check with calipers
nut_lateral_clearance = 0.20;
nut_thickness_clearance = 0.25;
nut_center_y = 3.9;
screw_height = 4.8;  // measured upwards from motor-entry end
pocket_above_screw = 2.3;

// Derived quantities
nut_slot_width = m2_nut_across_flats / cos(30) + nut_lateral_clearance;
nut_slot_depth = m2_nut_thickness + nut_thickness_clearance;
hub_radius = hub_diameter/2;
top_z = hub_height+flange_thickness;

assert(motor_socket_depth < hub_height, "Socket would cut the flange");
assert(hub_radius - (nut_center_y + nut_slot_depth/2) >= 1.1,
       "Hub wall outside nut pocket too thin");
assert((bolt_circle_diameter/2 + flange_hole_diameter/2) < flange_diameter/2 - 1.0,
       "Flange bolt holes too close to rim");
assert(bolt_circle_diameter/2 - flange_hole_diameter/2 > hub_radius + 0.25,
       "Bolt holes interfere with hub");
assert(screw_height+pocket_above_screw < hub_height,
       "Nut pocket too tall");

module double_flat_socket(){
  intersection(){
    cylinder(d=motor_shaft_diameter+motor_fit_clearance,
             h=motor_socket_depth+0.10);
    translate([-motor_shaft_diameter, -(motor_flat_distance+motor_fit_clearance)/2, -0.01])
      cube([2*motor_shaft_diameter, motor_flat_distance+motor_fit_clearance,
            motor_socket_depth+0.14]);
  }
}

module flange_adapter(){
  difference(){
    union(){
      cylinder(d=hub_diameter,h=hub_height);
      translate([0,0,hub_height]) cylinder(d=flange_diameter,h=flange_thickness);
    }
    // Double-flatted bore enters from motor side; blind end protects flange face
    translate([0,0,-0.04]) double_flat_socket();

    // Screw +Y points radially inwards to the Y-flat of the motor
    translate([0,0,screw_height]) rotate([-90,0,0])
      cylinder(d=m2_screw_clearance,h=hub_radius+0.10);

    // Bottom-load captive M2 nut: no insertion during printing needed.
    // Nut is held against rotation by slot walls once grub screw is installed.
    translate([-nut_slot_width/2,nut_center_y-nut_slot_depth/2,-0.1])
      cube([nut_slot_width,nut_slot_depth,
            screw_height+pocket_above_screw+0.1]);

    // Mounting holes through flange
    for (i=[0:flange_holes-1]) {
      angle=bolt_angle_offset+360*i/flange_holes;
      translate([(bolt_circle_diameter/2)*cos(angle),
                 (bolt_circle_diameter/2)*sin(angle),hub_height-0.05])
         cylinder(d=flange_hole_diameter,h=flange_thickness+0.10);
    }
  }
}
flange_adapter();
