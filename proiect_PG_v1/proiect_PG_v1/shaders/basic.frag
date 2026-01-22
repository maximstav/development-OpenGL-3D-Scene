#version 410 core

in vec3 fPosition;
in vec3 fNormal;
in vec2 fTexCoords;
in vec4 fragPosLightSpace;

out vec4 fColor;

// Matrices
uniform mat4 model;
uniform mat4 view;
uniform mat3 normalMatrix;

// Lighting Uniforms
uniform vec3 lightDir; 
uniform vec3 lightColor;
uniform vec3 pointLightPos;

// Texture Uniforms
uniform sampler2D diffuseTexture;
uniform sampler2D specularTexture;
uniform sampler2D shadowMap;
uniform int initAlpha; // 1 = Check Alpha, 0 = Ignore Alpha

// Lighting Constants
vec3 ambient;
vec3 diffuse;
vec3 specular;
float ambientStrength = 0.2f;
float specularStrength = 0.5f;
float shininess = 32.0f;

// Attenuation Constants
float constant = 1.0f;
float linear = 0.09f;
float quadratic = 0.032f;

float computeFog()
{
    float fogDensity = 0.05f;
    
    // Calculate position in View Space (Eye Space)
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    
    // Calculate distance from camera
    float fragmentDistance = length(fPosEye.xyz);
    
    // Calculate exponential fog factor: e^(-(distance * density)^2)
    float fogFactor = exp(-pow(fragmentDistance * fogDensity, 2));
    
    // Clamp result between 0 and 1
    return clamp(fogFactor, 0.0f, 1.0f);
}

float computeShadow()
{
    // 1. Perform perspective divide
    vec3 normalizedCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;

    // 2. Transform to [0,1] range
    normalizedCoords = normalizedCoords * 0.5 + 0.5;

    // 3. Get closest depth value from light's perspective
    float closestDepth = texture(shadowMap, normalizedCoords.xy).r;

    // 4. Get depth of current fragment from light's perspective
    float currentDepth = normalizedCoords.z;

    // 5. Calculate bias (simple constant bias)
    float bias = 0.005f;

    // 6. Check for shadow
    float shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;

    // 7. Over sampling fix (if z > 1.0, it is outside the light frustum)
    if (normalizedCoords.z > 1.0)
        shadow = 0.0;

    return shadow;
}

void computeDirLight()
{
    // Calculate eye space positions
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);
    
    // Light direction is already in view space if transformed in main.cpp, 
    // but typically we pass world space lightDir.
    // Assuming lightDir is World Space, we transform it to View Space:
    vec3 lightDirN = vec3(normalize(view * vec4(lightDir, 0.0f)));

    // Ambient
    ambient += ambientStrength * lightColor;

    // Diffuse
    float diff = max(dot(normalEye, lightDirN), 0.0f);
    
    // Specular
    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    
    // Calculate Shadow
    float shadow = computeShadow();

    // Modulate Diffuse and Specular
    diffuse += (1.0f - shadow) * diff * lightColor;
    specular += (1.0f - shadow) * specularStrength * spec * lightColor;
}

void computePointLight()
{
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);

    vec4 lightPosEye = view * vec4(pointLightPos, 1.0f);
    vec3 lightDirN = normalize(lightPosEye.xyz - fPosEye.xyz);

    float dist = length(lightPosEye.xyz - fPosEye.xyz);
    float att = 1.0 / (constant + linear * dist + quadratic * (dist * dist));

    ambient += (ambientStrength * lightColor) * att;

    float diff = max(dot(normalEye, lightDirN), 0.0f);
    diffuse += (diff * lightColor) * att;

    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    specular += (specularStrength * spec * lightColor) * att;
}

void computeSpotLight()
{
    // 1. Get positions in Eye Space
    vec4 fPosEye = view * model * vec4(fPosition, 1.0f);
    vec3 normalEye = normalize(normalMatrix * fNormal);
    vec3 viewDir = normalize(-fPosEye.xyz);

    // 2. Spot Light Logic (Flashlight)
    // In Eye Space, camera is at (0,0,0) and looks down -Z (0,0,-1)
    vec3 lightPosEye = vec3(0.0f, 0.0f, 0.0f); // Camera Position
    vec3 spotDir = vec3(0.0f, 0.0f, -1.0f);    // Camera Front
    
    vec3 lightDirN = normalize(lightPosEye - fPosEye.xyz);
    
    // Cutoff logic (Cosines of 12.5 and 17.5 degrees)
    float cutOff = 0.976f;      
    float outerCutOff = 0.953f; 

    float theta = dot(lightDirN, normalize(-spotDir)); 
    float epsilon = cutOff - outerCutOff;
    float intensity = clamp((theta - outerCutOff) / epsilon, 0.0, 1.0);

    // Attenuation
    float dist = length(lightPosEye - fPosEye.xyz);
    float att = 1.0 / (constant + linear * dist + quadratic * (dist * dist));

    // Apply Flashlight (White Color)
    ambient += (ambientStrength * vec3(1.0f)) * att * intensity;
    diffuse += (intensity * att) * max(dot(normalEye, lightDirN), 0.0f) * vec3(1.0f);
    
    vec3 reflectDir = reflect(-lightDirN, normalEye);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0f), shininess);
    specular += (intensity * att * specularStrength) * spec * vec3(1.0f);
}

void main() 
{
    // discard fragments
    vec4 colorFromTexture = texture(diffuseTexture, fTexCoords);
    if(initAlpha == 1 && colorFromTexture.a < 0.1)
        discard;

    vec3 texDiffuse = colorFromTexture.rgb;
    vec3 texSpecular = texture(specularTexture, fTexCoords).rgb;

    ambient = vec3(0.0f);
    diffuse = vec3(0.0f);
    specular = vec3(0.0f);

    computeDirLight();
    computePointLight();

    // computeSpotLight(); // uncomment for Spot Light (from camera)

    vec3 color = min((ambient + diffuse) * texDiffuse + specular * texSpecular, 1.0f);
    
    // Appy fog
    float fogFactor = computeFog();
    vec4 fogColor = vec4(0.5f, 0.5f, 0.5f, 1.0f); // Gray fog

    fColor = mix(fogColor, vec4(color, 1.0f), fogFactor);
}