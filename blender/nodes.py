class NodeBuilder:
    def __init__(self, tree):
        self.tree = tree
        self.column = 0

    def node(self, kind, data_type=None, **inputs):
        node = self.tree.nodes.new(kind)
        if data_type is not None:
            node.data_type = data_type
        node.location = (self.column * 220, 0)
        self.column += 1
        for name, value in inputs.items():
            node.inputs[name.replace("_", " ")].default_value = value
        return node

    def link(self, source, target):
        if isinstance(source, (int, float, tuple)):
            target.default_value = source
            return
        self.tree.links.new(source, target)

    def feed(self, socket, value):
        self.link(value, socket)

    def math(self, operation, a, b=0.0):
        node = self.node("ShaderNodeMath")
        node.operation = operation
        self.feed(node.inputs[0], a)
        self.feed(node.inputs[1], b)
        return node.outputs[0]

    def map_range(self, value, from_min, from_max, to_min, to_max, smooth=False):
        node = self.node("ShaderNodeMapRange")
        node.clamp = True
        if smooth:
            node.interpolation_type = "SMOOTHSTEP"
        self.feed(node.inputs["Value"], value)
        node.inputs["From Min"].default_value = from_min
        node.inputs["From Max"].default_value = from_max
        node.inputs["To Min"].default_value = to_min
        node.inputs["To Max"].default_value = to_max
        return node.outputs["Result"]

    def mix_color(self, factor, a, b, blend):
        node = self.node("ShaderNodeMix", data_type="RGBA")
        node.blend_type = blend
        sockets = {s.identifier: s for s in node.inputs}
        self.feed(sockets["Factor_Float"], factor)
        self.feed(sockets["A_Color"], a)
        self.feed(sockets["B_Color"], b)
        return {s.identifier: s for s in node.outputs}["Result_Color"]

    def texture(self, image, vector):
        node = self.node("ShaderNodeTexImage")
        node.image = image
        node.interpolation = "Cubic"
        self.link(vector, node.inputs["Vector"])
        self.tree.nodes.active = node
        return node.outputs["Color"]
