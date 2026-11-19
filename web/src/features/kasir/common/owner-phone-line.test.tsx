import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { OwnerPhoneLine } from "./owner-phone-line";

test("nomor ada → 'Ragu? Telepon pemilik: {nomor}'", () => {
  render(<OwnerPhoneLine phone="0812-3456-7890" />);
  expect(
    screen.getByText("Ragu? Telepon pemilik: 0812-3456-7890"),
  ).toBeInTheDocument();
});

test("nomor null → tidak merender apa pun", () => {
  const { container } = render(<OwnerPhoneLine phone={null} />);
  expect(container).toBeEmptyDOMElement();
});

test("nomor kosong/spasi → tidak merender apa pun", () => {
  const { container } = render(<OwnerPhoneLine phone="  " />);
  expect(container).toBeEmptyDOMElement();
});
