
$fn = 72;

// ---- Parameters ----
L = 25;
NARROW_L = 10;
NARROW_W = 6;

BASE_H = 3;

WIDE_INTERNAL_W = 25;
WALL_T = 1.2;
TOTAL_H_END = 15;   // total height including 3 mm base

HOLE_D = 3.2;
HOLE_X = 5;
HOLE_Y = NARROW_W/2;

// Optional screw fixing through the floor of the wide section
SCREW_HOLE_D = 3.2;   // clearance for an M3-sized screw; adjust for chosen wood screw
SCREW_HOLE_X = 20;    // centered along the 10..25 mm wide section
// Center wide section around the same centerline as narrow section
CY = NARROW_W/2;
SCREW_HOLE_Y = CY;    // aligned with the central axis

wide_inner_y0 = CY - WIDE_INTERNAL_W/2;
wide_inner_y1 = CY + WIDE_INTERNAL_W/2;

// overall wide base including side walls
wide_outer_y0 = wide_inner_y0 - WALL_T;
wide_outer_y1 = wide_inner_y1 + WALL_T;

// ---- Base ----
module base_shape() {
    union() {
        // Narrow section 0..10 mm, 6 mm width
        cube([NARROW_L, NARROW_W, BASE_H], center=false);

        // Wide section 10..25 mm, 25 mm internal width + wall thickness zones
        translate([NARROW_L, wide_outer_y0, 0])
            cube([L-NARROW_L, wide_outer_y1-wide_outer_y0, BASE_H], center=false);
    }
}

// ---- Triangular walls ----
module left_wall() {
    // inner face at y = wide_inner_y0, outer face at y = wide_outer_y0
    polyhedron(
        points=[
            [NARROW_L, wide_inner_y0, BASE_H],          // 0 inner bottom start
            [NARROW_L, wide_outer_y0, BASE_H],          // 1 outer bottom start
            [NARROW_L, wide_inner_y0, BASE_H],          // 2 inner top start (zero height)
            [NARROW_L, wide_outer_y0, BASE_H],          // 3 outer top start

            [L, wide_inner_y0, BASE_H],                 // 4 inner bottom end
            [L, wide_outer_y0, BASE_H],                 // 5 outer bottom end
            [L, wide_inner_y0, TOTAL_H_END],            // 6 inner top end
            [L, wide_outer_y0, TOTAL_H_END]             // 7 outer top end
        ],
        faces=[
            [0,4,6,2],   // inner
            [1,3,7,5],   // outer
            [0,1,5,4],   // bottom
            [2,6,7,3],   // top slope
            [0,2,3,1],   // start
            [4,5,7,6]    // end
        ],
        convexity=10
    );
}

module right_wall() {
    polyhedron(
        points=[
            [NARROW_L, wide_inner_y1, BASE_H],
            [NARROW_L, wide_outer_y1, BASE_H],
            [NARROW_L, wide_inner_y1, BASE_H],
            [NARROW_L, wide_outer_y1, BASE_H],

            [L, wide_inner_y1, BASE_H],
            [L, wide_outer_y1, BASE_H],
            [L, wide_inner_y1, TOTAL_H_END],
            [L, wide_outer_y1, TOTAL_H_END]
        ],
        faces=[
            [0,2,6,4],
            [1,5,7,3],
            [0,4,5,1],
            [2,3,7,6],
            [0,1,3,2],
            [4,6,7,5]
        ],
        convexity=10
    );
}

difference() {
    union() {
        base_shape();
        left_wall();
        right_wall();
    }

    // Guide hole in narrow section
    translate([HOLE_X, HOLE_Y, -1])
        cylinder(h=TOTAL_H_END+2, d=HOLE_D);

    // Screw hole through the 3 mm bottom plate, between the two side walls
    translate([SCREW_HOLE_X, SCREW_HOLE_Y, -1])
        cylinder(h=BASE_H+2, d=SCREW_HOLE_D);
}
