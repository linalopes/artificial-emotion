// N20 90-degree holder — V4, total length 16 mm
// Axial layout: 5 mm motor socket + 3 mm solid transition + 8 mm material slots
// Units: mm
$fn = 128;

body_d = 8.0;
motor_section = 5.0;
solid_section = 3.0;
slot_section = 8.0;
body_h = motor_section + solid_section + slot_section; // 16 mm

// Same motor-side fit as V3
shaft_d = 3.40;
shaft_flat = 0.50;
shaft_depth = motor_section;
motor_relief_w = 1.0;

// Material side: same cross widths, now occupying its own 8 mm section
cross_wide_w = 2.0;
cross_narrow_w = 1.0;
cross_depth = slot_section;

eps = 0.05;

module d_socket(d, flat, depth) {
    r = d/2;
    flat_x = r-flat;
    intersection() {
        cylinder(d=d, h=depth+eps);
        translate([-r-eps,-r-eps,-eps])
            cube([flat_x+r+eps, d+2*eps, depth+2*eps]);
    }
}

difference() {
    cylinder(d=body_d, h=body_h);

    // Bottom 5 mm: motor D socket
    translate([0,0,-eps])
        d_socket(shaft_d, shaft_flat, shaft_depth);

    // Bottom 5 mm: single 1 mm radial relief slit
    translate([0,-motor_relief_w/2,-eps])
        cube([body_d/2+eps, motor_relief_w, shaft_depth+eps]);

    // Top 8 mm: 2 mm slot
    translate([-body_d/2-eps,-cross_wide_w/2,body_h-cross_depth])
        cube([body_d+2*eps,cross_wide_w,cross_depth+eps]);

    // Top 8 mm: perpendicular 1 mm slot
    translate([-cross_narrow_w/2,-body_d/2-eps,body_h-cross_depth])
        cube([cross_narrow_w,body_d+2*eps,cross_depth+eps]);
}
