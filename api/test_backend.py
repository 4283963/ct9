"""快速验证后端物理求解器与矩阵转换工作是否正常"""
import sys, json, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.physics.solver import SimulationParams, run_simulation
from api.router.matrix_transform import to_frontend_payload

if __name__ == "__main__":
    p = SimulationParams(
        ambient_temp=25.0,
        irradiance=800.0,
        array_length=2.0,
        nodes=80,
        time_step=5.0,
        total_time=600.0,
        alpha=9.7e-5,
        ref_efficiency=0.22,
        temp_coeff=0.0042,
        heat_transfer_coeff=20.0,
    )
    result = run_simulation(p)
    print("T_matrix shape:", result.T_matrix.shape)
    print("Initial mean temp (℃):", result.T_matrix[0].mean())
    print("Final mean temp (℃):", result.T_matrix[-1].mean())
    print("Peak temp (℃):", result.T_matrix.max())
    print("Min temp (℃):", result.T_matrix.min())
    print("Peak efficiency:", result.eta_profile.max())
    print("Min efficiency:", result.eta_profile.min())
    payload = to_frontend_payload(result)
    print("Payload metrics:", json.dumps(payload["metrics"], indent=2))
    print("Efficiency profile size:", len(payload["efficiencyProfile"]))
    print("spaceTimeGrid shape:",
          len(payload["spaceTimeGrid"]["matrix"]),
          "x", len(payload["spaceTimeGrid"]["matrix"][0]))
    print("OK")
