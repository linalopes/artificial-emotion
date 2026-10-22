// V03 - support for Ø40 mm pulley, 10 mm thick, mounted on 10x20 M3 pattern
// Units: mm. OpenSCAD parametric master.
$fn = 96;
base_width = 24;
base_length = 28;
base_thickness = 5;
base_corner_radius = 3;
mount_pitch_x = 10;
mount_pitch_y = 20;
mount_hole_d = 3.3;
mount_hardware_clearance_d = 8;  // Ø8 free below each hole for screw head/nut/washer
pulley_d = 40;
pulley_thickness = 10;
side_clearance = 1;
fork_gap = pulley_thickness + 2*side_clearance;
fork_wall = 2.5;
fork_profile_neck_width = 8; // narrow at base to avoid M3 fittings
fork_end_radius = 8;
axle_drop = 30;              // underside base -> axle centre
axle_hole_d = 6.3;
base_overlap = 2;            // wall enters base without reaching mounting top

fork_outer_width = fork_gap + 2*fork_wall;

module rounded_plate(w,l,r,h) {
    linear_extrude(height=h)
        offset(r=r) offset(delta=-r)
            square([w,l],center=true);
}

// X is wall thickness; profile in YZ. Near the base its width is only 8 mm,
// widening towards the rounded axle end. This leaves all four M3 access zones free.
module fork_wall(x0) {
    translate([x0,0,0]) rotate([0,90,0])
        linear_extrude(height=fork_wall)
            hull() {
                translate([-base_overlap,0])
                    square([0.3,fork_profile_neck_width],center=true);
                translate([axle_drop,0]) circle(r=fork_end_radius);
            }
}

module bracket() {
  difference() {
    union() {
      rounded_plate(base_width,base_length,base_corner_radius,base_thickness);
      fork_wall(-fork_gap/2-fork_wall);
      fork_wall( fork_gap/2);
    }
    // Through holes in base, keeping original 10 x 20 pitch
    for (x=[-mount_pitch_x/2,mount_pitch_x/2])
      for (y=[-mount_pitch_y/2,mount_pitch_y/2]) {
        translate([x,y,-0.1]) cylinder(d=mount_hole_d,h=base_thickness+0.2);
        // The narrowed fork roots leave an unobstructed Ø8 mm zone below each M3 hole.
      }
    // M6 axle through both fork walls
    translate([-fork_outer_width/2-1,0,-axle_drop])
      rotate([0,90,0]) cylinder(d=axle_hole_d,h=fork_outer_width+2);
  }
}
bracket();
