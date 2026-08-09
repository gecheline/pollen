What I'm building

pollen is a desktop web tool for comparing how different "lenses" change what a language model says.

A person types one question. It's answered several times at once, side by side, in separate panels:

Baseline — the model with no lens applied
One panel per lens — a lens is a named perspective (Scientist, Poet, Skeptic, Naturalist…) with an editable description
Mixed — one answer produced by blending the lenses together as they write, word by word

Above each answer sits that panel's map: a fixed 2D scatter of the model's entire vocabulary, laid out so words with related meanings sit near each other. As the panel writes, the words it's actually considering light up on the map. The maps are the point of the product — you watch four different personalities light up four different regions of the same landscape.

Audience: designers, researchers, and curious people. Not ML engineers. Nothing on screen should require a stats background to enjoy.

Layout to keep

The current structure works. Redesign its skin, not its bones. See attached screenshots.

Left rail, fixed: stacked list of lenses. Each is a toggle; when active it expands to show a weight slider, a truncated description, an Edit affordance, and a small "add .md" file attachment. Below: "+ Custom lens." At the bottom of the rail, three dropdown controls — Combine, Weight, History — with a one-line explanation under whichever one needs it.
Top bar: one wide text input for the question, a small length dropdown, a Generate button.
Main area: a horizontal row of panels, each = header label + map + streaming answer text + two small sparklines. Panel count is variable, 2 to 6. Design the 2-panel and 5-panel cases explicitly; they are different problems.
Bottom strip: a row of cross-panel metrics, each a label + thin bar + number.
Visual direction: herbarium specimen plate

Treat every screen as a plate from a botanical reference book. The map is the specimen. The interface is the sheet it's mounted on — calm, precise, generously ruled, densely labeled in small type. All ornament budget goes into the maps and the labels. Nothing else gets decorated.

Concretely:

Hairlines, not boxes. Panels are separated by 1px rules, not cards with borders, fills, and shadows. Zero or near-zero corner radius.
Small type, lots of air. Labels are tiny, letterspaced, uppercase. Whitespace does the organizing.
No gradients, no glows, no glassmorphism, no drop shadows. If it looks like a SaaS dashboard, it's wrong.
Lens names in italic serif, like Latin binomials on a specimen tag. This is the one characterful typographic move — everything else is neutral. Body/answer text stays monospace (it reads as instrument output). Labels and numbers in a clean grotesque with true small caps.

Signature element: each panel is headed by a specimen tag — a filled seed-dot in that lens's accent color, the lens name in italic serif, a hairline rule running the full panel width beneath it. That tag is the only place color appears in the chrome.

Color

Six accents, one assigned per lens, drawn from the inspo plates: plum-violet, dusty magenta, sage, faded coral, dusty rose, muted teal. Low saturation, chalky, never neon. A lens's accent is used in exactly two places: its specimen tag, and the lit-up points on its map. Nothing else is colored.

Do not use terracotta or warm clay as an accent. It's overused and reads as a default.

Light mode

Warm paper ground, slightly grey-green rather than yellow-cream. Near-black ink for text, warm grey for hairlines and secondary labels.

Dark mode

Not pure black. A deep, warm, aubergine-tinted near-black — pressed paper aged dark, not outer space. The current app is pure black and reads cold and generic; that's the thing I'm moving away from.

Provide both modes as a proper token set (surface, surface-raised, ink, ink-muted, hairline, and the six accents), with a toggle in the top bar.

The maps — read this carefully

You cannot generate the real visualization; it's computed by the backend. Do not try to design the data itself. Treat each map as a fixed-aspect canvas region and design its frame and states:

Empty — before generating. The vocabulary cloud sits dormant.
Generating — points lighting up in the lens's accent color.
Complete — the settled pattern.

Use a static placeholder scatter to represent it. What I need from you is the container, the label treatment, the aspect ratio, and how the three states read differently.

Light and dark mode invert differently here, and this is not a color swap. In dark mode the cloud is dim and lit points glow — luminance carries the signal. In light mode luminance is unavailable; the cloud must become fine grey ink-dust on paper, and lit points must read through saturation and density in the accent color instead. Design light mode's map first, since it's the harder one.

Deliver

Both modes, as a named token set. The two-panel and five-panel layouts. Panel empty / generating / complete states. Lens rail collapsed and expanded. Desktop-first (this is a wide, dense tool) but don't let it break under 1280px.

What not to do
Don't put illustrated flowers, leaves, vines, or petals anywhere in the chrome. The botanical quality comes from the maps and from restraint, not from clip art.
Don't make it a gardening or wellness app. It's a scientific instrument that happens to be beautiful.
Don't add a hero section, marketing copy, feature cards, or onboarding. It's a tool; it opens ready to use.
Don't invent additional panels, tabs, or navigation.
Note on the attached images
Images 1 and 2 (generative botanical forms): the character the maps should have — hairline density, translucent layering, bilateral structure. Not a layout reference.
Image 4 (orchid specimen infographic): the layout and labeling discipline for everything else — the muted ground, the tiny letterspaced labels, the calm density, the hairline rules.
Image 3 (dandelion diagram): the accent palette and the idea that a diagram can be beautiful without being decorated.
Screenshots: the current app. Keep this structure. Replace this aesthetic.