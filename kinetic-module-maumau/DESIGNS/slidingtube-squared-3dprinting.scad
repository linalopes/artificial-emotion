// Artificial Emotion / MauMau — Sliding Tube Squared V2 (Clearance B)
// Units: millimeters
// Reconstructed from slidingtube-squared-3dprinting.stl.
// Original guide opening in laser-cut acrylic: nominal 6 x 6 mm.
// This version reduces only the tube's external square profile.

acrylic_opening = 6.0;        // Nominal square guide opening
sliding_clearance = 0.10;    // Nominal clearance on EACH side
shaft_width = acrylic_opening - 2 * sliding_clearance; // 5.80 mm

shaft_length = 30.0;         // From top of flange to tip
channel_width = 2.50;        // Square through-channel (unchanged)
flange_width = 6.0;          // Y dimension of base tab (unchanged)
flange_thickness = 2.0;      // Z thickness of base tab (unchanged)
flange_left = 6.0;           // Extension beyond original 6-mm shaft, -X
flange_right = 4.0;          // Extension beyond original 6-mm shaft, +X
original_shaft_width = 6.0;

assert(shaft_width > channel_width, "Tube width must exceed channel width");
assert(sliding_clearance >= 0, "Clearance must be nonnegative");

module sliding_tube() {
    difference() {
        union() {
            // Base tab: matches original STL exactly, -9 to +7 on X.
            translate([(flange_right - flange_left)/2, 0, flange_thickness/2])
                cube([original_shaft_width + flange_left + flange_right,
                      flange_width, flange_thickness], center=true);

            // Reduced square shaft, centred on same axis as original.
            translate([0, 0, flange_thickness + shaft_length/2])
                cube([shaft_width, shaft_width, shaft_length], center=true);
        }

        // Through-channel: unchanged square 2.5 x 2.5 mm.
        translate([0, 0, (flange_thickness + shaft_length)/2])
            cube([channel_width, channel_width,
                  flange_thickness + shaft_length + 2], center=true);
    }
}

sliding_tube();
