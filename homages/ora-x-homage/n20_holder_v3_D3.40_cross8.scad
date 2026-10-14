// N20 90-degree holder — V3
// Units: mm
$fn = 128;

body_d = 8.0;
body_h = 10.0;

// N20 nominal Ø3 mm D-shaft.
// V2 at 3.15 mm was slightly too tight on this K1.
// V3 uses 3.40 mm as a conservative snug-fit test.
shaft_d = 3.40;
shaft_flat = 0.50;
shaft_depth = 5.0;
motor_relief_w = 1.0;

// Material side: perpendicular slots forming a cross.
// User requested depth increased from 2 mm to 8 mm.
cross_wide_w = 2.0;
cross_narrow_w = 1.0;
cross_depth = 8.0;

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

    // MOTOR SIDE: D socket
    translate([0,0,-eps])
        d_socket(shaft_d, shaft_flat, shaft_depth);

    // MOTOR SIDE: one 1 mm radial relief slit
    translate([0,-motor_relief_w/2,-eps])
        cube([body_d/2+eps, motor_relief_w, shaft_depth+eps]);

    // MATERIAL SIDE: 2 mm slot
    translate([-body_d/2-eps,-cross_wide_w/2,body_h-cross_depth])
        cube([body_d+2*eps,cross_wide_w,cross_depth+eps]);

    // MATERIAL SIDE: perpendicular 1 mm slot
    translate([-cross_narrow_w/2,-body_d/2-eps,body_h-cross_depth])
        cube([cross_narrow_w,body_d+2*eps,cross_depth+eps]);
}
