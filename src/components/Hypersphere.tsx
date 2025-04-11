"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import { MeshStandardMaterial, SphereGeometry } from "three";

const Hypersphere = () => {
  return (
    <Canvas style={{ height: "100%", width: "100%" }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} />
      <Suspense fallback={null}>
        <mesh rotation={[0, 0, 0]}>
          <sphereGeometry args={[1.5, 64, 64]} />
          <meshStandardMaterial color="#eeeeee" emissive="#222288" metalness={0.6} roughness={0.3} />
        </mesh>
        <OrbitControls enableZoom={false} enableDamping />
      </Suspense>
    </Canvas>
  );
};

export default Hypersphere;
