"""Read ONNX graph input declarations without loading weights or third-party packages."""

def varint(data, offset):
    value = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
        shift += 7


def fields(data):
    offset = 0
    while offset < len(data):
        key, offset = varint(data, offset)
        kind, number = key & 7, key >> 3
        if kind == 0:
            value, offset = varint(data, offset)
        elif kind == 2:
            size, offset = varint(data, offset)
            value = data[offset:offset + size]
            offset += size
        elif kind in (1, 5):
            size = 8 if kind == 1 else 4
            value = data[offset:offset + size]
            offset += size
        else:
            raise ValueError(f'Unsupported protobuf wire type: {kind}')
        yield number, value


def inputs(path):
    graph = next(value for number, value in fields(path.read_bytes()) if number == 7)
    result = {}
    for number, value in fields(graph):
        if number != 11:
            continue
        info = dict(fields(value))
        tensor = dict(fields(dict(fields(info[2]))[1]))
        shape = []
        for _, dimension in fields(tensor.get(2, b'')):
            dim = dict(fields(dimension))
            size = dim.get(1, dim.get(2, b'?'))
            shape.append(size.decode() if isinstance(size, bytes) else size)
        result[info[1].decode()] = {'dtype': tensor[1], 'shape': shape}
    return result
